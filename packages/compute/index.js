'use strict';
/**
 * packages/compute —— M3 分布式计算层
 */
const { Compute } = require('./src/compute');
const { Aggregator } = require('./src/aggregator');
const { Verify } = require('./src/verify');
const { Reputation } = require('./src/reputation');

module.exports = { Compute, Aggregator, Verify, Reputation };
