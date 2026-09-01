'use strict';
/**
 * packages/app —— 应用层（M5 游戏大厅 + 联邦协议）
 */
const { Lobby, PLAYER_STATES } = require('./src/lobby');
const { Fed, EVENT_TYPES, FED_PROTOCOL_VERSION } = require('./src/fed');

module.exports = { Lobby, PLAYER_STATES, Fed, EVENT_TYPES, FED_PROTOCOL_VERSION };
