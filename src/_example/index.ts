import Relayer from './relayer/lib/relayer';

const relayer = new Relayer();

relayer.link(
  [
    {
      'id': 'spn-1-mars-1',
      'ordering': 'ORDER_ORDERED',
      'src': {
        'chain_id': 'spn-1',
        'connection_id': '',
        'channel_id': '',
        'port_id': 'monitoringc',
        'version': 'monitoring-1',
        'packet_height': 0,
        'ack_height': 0
      },
      'dst': {
        'chain_id': 'mars-1',
        'connection_id': '',
        'channel_id': '',
        'port_id': 'monitoringp',
        'version': 'monitoring-1',
        'packet_height': 0,
        'ack_height': 0
      }
    },
    {
      'id': 'spn-1',
      'account': 'alice',
      'address_prefix': 'spn',
      'rpc_address': 'http://0.0.0.0:26657',
      'gas_price': '0.0000025uspn',
      'gas_limit': 400000
    },
    {
      'id': 'mars-1',
      'account': 'alice',
      'address_prefix': 'cosmos',
      'rpc_address': 'http://localhost:26659',
      'gas_price': '0.0000025stake',
      'gas_limit': 400000
    },
    '455c1e16aeb5c60a450a39980587c206abac02ec39035dc883838f82846a795f',
    '455c1e16aeb5c60a450a39980587c206abac02ec39035dc883838f82846a795f',
    '07-tendermint-0',
    '07-tendermint-0'
  ]
);
