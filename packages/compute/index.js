'use strict';
/**
 * packages/compute —— M3 分布式计算层 + M6 治理与信誉
 */
const { Compute } = require('./src/compute');
const { Aggregator } = require('./src/aggregator');
const { Verify } = require('./src/verify');
const { Reputation } = require('./src/reputation');
const { Governance, VERDICT_LEVELS } = require('./src/governance');

module.exports = { Compute, Aggregator, Verify, Reputation, Governance, VERDICT_LEVELS };
