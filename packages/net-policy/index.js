'use strict';
/**
 * packages/net-policy —— M2 联网策略 + NAT 中继兜底
 */
const { Policy } = require('./src/policy');
const { RelayClient } = require('./src/relay');

module.exports = { Policy, RelayClient };
