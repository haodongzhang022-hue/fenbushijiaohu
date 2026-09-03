'use strict';
/**
 * packages/core —— 核心包（M1 + P0 真实传输 + P1 Keystore）
 * 汇总导出四层模块，供测试与上层应用引用。
 */
const { Identity, Keystore } = require('./src/identity');
const { Policy } = require('./src/policy');
const { Session, MSG_TYPES } = require('./src/session');
const {
  Transport,
  MemoryTransport,
  NetTransport,
  encodeFrame,
  WebRTCTransport,
  Libp2pTransport,
  SignalingServer,
  SignalingSession,
  createSignaling,
  NetMesh,
  createTransport,
} = require('./src/transport');

module.exports = {
  Identity,
  Keystore,
  Policy,
  Session,
  MSG_TYPES,
  Transport,
  MemoryTransport,
  NetTransport,
  encodeFrame,
  WebRTCTransport,
  Libp2pTransport,
  SignalingServer,
  SignalingSession,
  createSignaling,
  NetMesh,
  createTransport,
};
