'use strict';
/**
 * packages/core —— 核心包（M1 最小可测 MVP）
 * 汇总导出四层模块，供测试与上层应用引用。
 */
const { Identity } = require('./src/identity');
const { Policy } = require('./src/policy');
const { Session, MSG_TYPES } = require('./src/session');
const { MemoryTransport } = require('./src/transport');

module.exports = { Identity, Policy, Session, MSG_TYPES, MemoryTransport };
