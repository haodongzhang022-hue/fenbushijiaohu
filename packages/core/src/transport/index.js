'use strict';
/**
 * transport 模块 —— 传输抽象（P0 真实传输适配器接入）
 *
 * 提供统一 Transport 接口契约，支持多种传输实现可插拔切换：
 *   - MemoryTransport   ：内存模拟（测试用，原有）
 *   - NetTransport      ：真实 TCP 回环套接字（CI 可测的真实网络，新增）
 *   - WebRTCTransport   ：浏览器 P2P（DTLS 加密，STUN/TURN 穿透）
 *   - Libp2pTransport   ：Node/服务端 P2P（Noise 加密，yamux 多路）
 *   - SignalingServer   ：信令服务（SDP/ICE 交换，真实网络建连）
 *
 * 对齐 16 号文档 §5 真实传输层设计 + 04 §3.3 接口契约：
 *   interface Transport {
 *     async connect(peer, signaling): Promise<Channel>;
 *     listen(cb): void;
 *     send(channel, chunk): Promise<boolean>;
 *     onData(cb): void;
 *     close(): void;
 *   }
 */

const { Transport } = require('./transport');
const { MemoryTransport } = require('./memory');
const { NetTransport, encodeFrame } = require('./net');
const { WebRTCTransport } = require('./webrtc');
const { Libp2pTransport } = require('./libp2p');
const { SignalingServer, SignalingSession, createSignaling } = require('./signaling');
const { NetMesh } = require('./mesh');

/**
 * 工厂：按类型创建传输实例
 * @param {'memory'|'net'|'webrtc'|'libp2p'} type
 * @param {string} nodeId
 * @param {object} [opts]
 */
function createTransport(type, nodeId, opts = {}) {
  switch (type) {
    case 'memory':
      return new MemoryTransport(nodeId, opts);
    case 'net':
      return new NetTransport(nodeId, opts);
    case 'webrtc':
      return new WebRTCTransport(nodeId, opts);
    case 'libp2p':
      return new Libp2pTransport(nodeId, opts);
    default:
      throw new Error(`未知传输类型: ${type}`);
  }
}

module.exports = {
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
