'use strict';
/**
 * transport 模块 —— 传输抽象（M1 最小实现）
 *
 * 架构师接口契约（04 §3.3）：
 *   interface Transport {
 *     connect(peer: PeerDesc): Promise<Channel>;
 *     listen(cb: (msg: Message) => void): void;
 *     close(): void;
 *   }
 *
 * 本实现提供一个**基于内存/回调的测试用传输**（MemoryTransport），
 * 用于本地跑通"两节点直连收发消息"闭环，不依赖真实 WebRTC/libp2p。
 * 真实适配器（WebRTC/libp2p）后续按同一接口契约接入。
 */

class MemoryTransport {
  /**
   * @param {string} nodeId 本地节点标识
   */
  constructor(nodeId) {
    this.nodeId = nodeId;
    this._listener = null;   // 收消息回调
    this._peer = null;       // 对端节点 id（简化：一对一）
    this._closed = false;
  }

  /**
   * 建立与对端的连接（测试环境：直接互绑）
   * @param {{id: string}} peerDesc 对端描述（内存模式下仅需 id）
   */
  async connect(peerDesc) {
    if (this._closed) throw new Error('transport 已关闭');
    this._peer = peerDesc.id;
    return { id: this.nodeId, peer: this._peer };
  }

  /**
   * 注册收消息回调
   * @param {(msg: object) => void} cb
   */
  listen(cb) {
    this._listener = cb;
  }

  /**
   * 向对端发送一条消息（测试环境：直接投递到对端 listener）
   * @param {object} msg
   * @param {MemoryTransport} peerTransport 对端传输实例（测试注入）
   */
  send(msg, peerTransport) {
    if (this._closed) throw new Error('transport 已关闭');
    if (peerTransport && peerTransport._listener) {
      peerTransport._listener({ ...msg, receivedAt: Date.now() });
    }
    return true;
  }

  close() {
    this._closed = true;
  }
}

module.exports = { MemoryTransport };
