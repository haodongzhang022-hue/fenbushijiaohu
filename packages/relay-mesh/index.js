'use strict';
/**
 * packages/relay-mesh —— M2a 中继网格+容错
 */
const { HealthMonitor } = require('./src/health');
const { FailoverManager } = require('./src/failover');
const { RelayMesh } = require('./src/mesh');
const { Multipath } = require('./src/multipath');

module.exports = { HealthMonitor, FailoverManager, RelayMesh, Multipath };
