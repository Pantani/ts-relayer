// cosmosjs related imports.
import { fromHex } from '@cosmjs/encoding';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';

import { orderFromJSON } from '../../../codec/ibc/core/channel/v1/channel';
import { Endpoint, IbcClient, Link } from '../../../index';
import { prepareConnectionHandshake } from '../../../lib/ibcclient';

// local imports.
import ConsoleLogger from './logger';

const calcGasLimits = (limit: number) => ({
  initClient: 150000,
  updateClient: 600000,
  initConnection: 150000,
  connectionHandshake: limit,
  initChannel: 150000,
  channelHandshake: limit,
  receivePacket: limit,
  ackPacket: limit,
  timeoutPacket: limit,
  transfer: 180000
});

type Chain = {
  id: string;
  account: string,
  address_prefix: string;
  rpc_address: string;
  gas_price: string;
  gas_limit: number;
};

type Path = {
  id: string;
  ordering: string;
  src: PathEnd;
  dst: PathEnd;
};

type PathEnd = {
  chain_id: string;
  connection_id: string;
  channel_id: string;
  port_id: string;
  version: string;
  packet_height?: number;
  ack_height?: number;
};

export default class Relayer {
  private defaultMaxAge = 86400;

  public async link([
                      path,
                      srcChain,
                      dstChain,
                      srcKey,
                      dstKey,
                      clientIdA,
                      clientIdB
                    ]: [Path, Chain, Chain, string, string, string?, string?]): Promise<Path> {
    const srcClient = await Relayer.getIBCClient(srcChain, srcKey);
    const dstClient = await Relayer.getIBCClient(dstChain, dstKey);

    let link;
    if (typeof clientIdA !== 'undefined' && typeof clientIdB !== 'undefined') {
      link = await this.createWithClient(srcClient, dstClient, clientIdA, clientIdB);
    } else {
      link = await Link.createWithNewConnections(srcClient, dstClient);
    }

    const channels = await link.createChannel(
      'A',
      path.src.port_id,
      path.dst.port_id,
      orderFromJSON(path.ordering),
      path.dst.version
    );

    path.src.channel_id = channels.src.channelId;
    path.dst.channel_id = channels.dest.channelId;
    path.src.connection_id = link.endA.connectionID;
    path.dst.connection_id = link.endB.connectionID;

    return path;
  }

  public async start([
                       path,
                       srcChain,
                       dstChain,
                       srcKey,
                       dstKey
                     ]: [Path, Chain, Chain, string, string]): Promise<Path> {
    const srcClient = await Relayer.getIBCClient(srcChain, srcKey);
    const dstClient = await Relayer.getIBCClient(dstChain, dstKey);

    const link = await Link.createWithExistingConnections(
      srcClient,
      dstClient,
      path.src.connection_id,
      path.dst.connection_id,
      new ConsoleLogger()
    );

    const heights = await link.checkAndRelayPacketsAndAcks(
      {
        packetHeightA: path.src.packet_height,
        packetHeightB: path.dst.packet_height,
        ackHeightA: path.src.ack_height,
        ackHeightB: path.dst.ack_height
      } ?? {},
      2,
      6
    );

    await link.updateClientIfStale('A', this.defaultMaxAge);
    await link.updateClientIfStale('B', this.defaultMaxAge);

    path.src.packet_height = heights.packetHeightA;
    path.dst.packet_height = heights.packetHeightB;
    path.src.ack_height = heights.ackHeightA;
    path.dst.ack_height = heights.ackHeightB;

    return path;
  }

  private static async getIBCClient(chain: Chain, key: string): Promise<IbcClient> {
    const chainGP = GasPrice.fromString(chain.gas_price);
    const signer = await DirectSecp256k1Wallet.fromKey(fromHex(key), chain.address_prefix);

    const [account] = await signer.getAccounts();

    return await IbcClient.connectWithSigner(
      chain.rpc_address,
      signer,
      account.address,
      {
        prefix: chain.address_prefix,
        gasPrice: chainGP,
        gasLimits: calcGasLimits(chain.gas_limit)
      }
    );
  }

  public async createWithClient(
    nodeA: IbcClient,
    nodeB: IbcClient,
    clientIdA: string,
    clientIdB: string
  ): Promise<Link> {
    // wait a block to ensure we have proper proofs for creating a connection (this has failed on CI before)
    await Promise.all([nodeA.waitOneBlock(), nodeB.waitOneBlock()]);

    // connectionInit on nodeA
    const { connectionId: connIdA } = await nodeA.connOpenInit(
      clientIdA,
      clientIdB
    );

    // connectionTry on nodeB
    const proof = await prepareConnectionHandshake(
      nodeA,
      nodeB,
      clientIdA,
      clientIdB,
      connIdA
    );

    const { connectionId: connIdB } = await nodeB.connOpenTry(clientIdB, proof);

    // connectionAck on nodeA
    const proofAck = await prepareConnectionHandshake(
      nodeB,
      nodeA,
      clientIdB,
      clientIdA,
      connIdB
    );
    await nodeA.connOpenAck(connIdA, proofAck);

    // connectionConfirm on dest
    const proofConfirm = await prepareConnectionHandshake(
      nodeA,
      nodeB,
      clientIdA,
      clientIdB,
      connIdA
    );
    await nodeB.connOpenConfirm(connIdB, proofConfirm);

    const endA = new Endpoint(nodeA, clientIdA, connIdA);
    const endB = new Endpoint(nodeB, clientIdB, connIdB);
    return new Link(endA, endB, new ConsoleLogger());
  }
}
