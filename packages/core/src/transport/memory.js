'use strict';
/**
 * transport 模块 —— 内存传输（测试用）
 *
 * 基于 Transport 抽象基类，提供内存/回调实现的测试用传输。
 * 用于本地跑通"两节点直连收发消息"闭环，不依赖真实网络。
 * 真实适配器（WebRTC/libp2p）按同一接口契约接入。
 *
 * P2-04 加固：send() 前校验目标 peer 已建立连接，未 connect 的直接投递被拒绝。
 * 明文透传仅限内存测试（无真实网络），真实适配器（WebRTC DTLS / libp2p Noise）
 * 自带传输层加密，加密闭环由真实网络协议栈覆盖，本层不做重复加密（评估留痕）。
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
    // bindPeer 视同建立连接（登记 channel）
    this._channels.set(peerTransport.nodeId, {
      id: `mem-${this.nodeId}-${peerTransport.nodeId}`,
      peer: peerTransport.nodeId,
      state: 'open',
    });
  }

  /**
   * 向对端发送一条消息（测试环境：直接投递到对端 listener）
   *
   * P2-04：send 前必须确认目标 peer 已建立连接（connect / bindPeer / peerRegistry），
   * 否则拒绝投递，杜绝"未 connect 直接 send"的越权路径。
   *
   * @param {object} msg
   * @param {MemoryTransport} [peerTransport] 对端传输实例（测试注入）
   */
  async send(msg, peerTransport) {
    this._assertOpen();
    let peerId = peerTransport ? peerTransport.nodeId : this.peers[0];
    // 从 peerRegistry 反查对端实例（若有）
    if (!peerTransport && this._peerRegistry && peerId != null) {
      peerTransport = this._peerRegistry[peerId];
    }
    // P2-04：校验目标 peer 已建立连接
    if (peerId == null || !this._channels.has(peerId)) {
      throw new Error(`未建立与 ${peerId || '(unknown)'} 的连接，拒绝发送`);
    }
    const peer = peerTransport || this._directPeers.get(peerId);
    if (peer) {
      peer._emitData({ ...msg, receivedAt: Date.now() }, this.nodeId);
    }
    return true;
  }
}

module.exports = { MemoryTransport };
