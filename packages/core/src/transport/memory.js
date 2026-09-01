'use strict';
/**
 * transport 模块 —— 内存传输（测试用）
 *
 * 基于 Transport 抽象基类，提供内存/回调实现的测试用传输。
 * 用于本地跑通"两节点直连收发消息"闭环，不依赖真实网络。
 * 真实适配器（WebRTC/libp2p）按同一接口契约接入。
 */

const { Transport } = require('./transport');

class MemoryTransport extends Transport {
  /**
   * @param {string} nodeId 本地节点标识
   * @param {object} [opts]
   * @param {object} [opts.peerRegistry] 共享注册表（用于跨实例互投）
   */
  constructor(nodeId, opts = {}) {
    super(nodeId);
    this.type = 'memory';
    this._peerRegistry = opts.peerRegistry || null; // 可选：共享注册表
    this._directPeers = new Map(); // peerId -> MemoryTransport（直接互绑）
  }

  /**
   * 建立与对端的连接（测试环境：直接互绑）
   * @param {{id: string}} peerDesc 对端描述（内存模式下仅需 id）
   */
  async connect(peerDesc) {
    this._assertOpen();
    this._state = 'connecting';
    const channel = {
      id: `mem-${this.nodeId}-${peerDesc.id}`,
      peer: peerDesc.id,
      state: 'open',
    };
    this._channels.set(peerDesc.id, channel);
    this._state = 'open';
    return { id: this.nodeId, peer: peerDesc.id, state: 'open' };
  }

  /**
   * 直接绑定对端传输实例（测试辅助）
   * @param {MemoryTransport} peerTransport
   */
  bindPeer(peerTransport) {
    this._directPeers.set(peerTransport.nodeId, peerTransport);
  }

  /**
   * 向对端发送一条消息（测试环境：直接投递到对端 listener）
   * @param {object} msg
   * @param {MemoryTransport} [peerTransport] 对端传输实例（测试注入）
   */
  async send(msg, peerTransport) {
    this._assertOpen();
    const peer = peerTransport || this._directPeers.get(this.peers[0]);
    if (peer) {
      peer._emitData({ ...msg, receivedAt: Date.now() }, this.nodeId);
    }
    return true;
  }
}

module.exports = { MemoryTransport };
