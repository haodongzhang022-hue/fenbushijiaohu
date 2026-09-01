'use strict';
/**
 * transport 模块 —— 传输抽象基类（P0 真实传输适配器）
 *
 * 对齐 16 号文档 §5.1 适配器抽象：
 *   interface Transport {
 *     async connect(peer, signaling): Promise<Channel>;
 *     listen(cb): void;
 *     send(channel, chunk): Promise<boolean>;
 *     onData(cb): void;
 *     close(): void;
 *   }
 *
 * 本基类提供统一接口契约 + 状态机管理，供 WebRTCTransport / Libp2pTransport /
 * MemoryTransport 继承实现。任何传输实现必须满足以下约束：
 *   - connect 建立与对端的链路（经信令或直接互绑）
 *   - listen 注册入站连接回调
 *   - send 可靠发送（返回 Promise<boolean>）
 *   - onData 数据到达回调
 *   - close 关闭传输并释放资源
 */

class Transport {
  /**
   * @param {string} nodeId 本地节点标识
   */
  constructor(nodeId) {
    this.nodeId = nodeId;
    this._state = 'idle';       // idle→connecting→open→closed
    this._listener = null;      // 入站连接回调
    this._dataCb = null;        // 数据回调
    this._channels = new Map(); // peerId -> channel
  }

  /** 当前状态机状态 */
  get state() {
    return this._state;
  }

  /**
   * 建立与对端的连接
   * @param {object} peer 对端描述 { id, ... }
   * @param {object} [signaling] 信令通道（SDP/ICE 交换用）
   * @returns {Promise<{id:string, peer:string, state:string}>}
   */
  async connect(peer, signaling) {
    this._assertOpen();
    this._state = 'connecting';
    try {
      const channel = await this._negotiate(peer, signaling);
      this._state = 'open';
      this._channels.set(peer.id, channel);
      return { id: this.nodeId, peer: peer.id, state: 'open' };
    } catch (e) {
      this._state = 'idle';
      throw e;
    }
  }

  /**
   * 子类实现：底层协商建立链路
   * @protected
   */
  async _negotiate(peer, signaling) {
    throw new Error('Transport._negotiate 未实现');
  }

  /**
   * 注册入站连接回调
   * @param {(peer: object) => void} cb
   */
  listen(cb) {
    this._listener = cb;
  }

  /**
   * 向已建立的对端发送数据
   * @param {string|object} channel 对端 channel id 或描述对象
   * @param {*} chunk 数据内容
   * @returns {Promise<boolean>}
   */
  async send(channel, chunk) {
    this._assertOpen();
    if (!this._channels.has(channel)) {
      throw new Error(`未建立与 ${channel} 的连接`);
    }
    return true;
  }

  /**
   * 注册数据到达回调
   * @param {(data: object, from: string) => void} cb
   */
  onData(cb) {
    this._dataCb = cb;
  }

  /**
   * 关闭传输
   */
  close() {
    this._state = 'closed';
    this._listener = null;
    this._dataCb = null;
    this._channels.clear();
  }

  /** 已建立连接的对端数 */
  get connectionCount() {
    return this._channels.size;
  }

  /** 已连接的对端 id 列表 */
  get peers() {
    return [...this._channels.keys()];
  }

  /** 内部：保证未关闭 */
  _assertOpen() {
    if (this._state === 'closed') {
      throw new Error(`transport ${this.nodeId} 已关闭`);
    }
  }

  /** 内部：投递数据到回调（由子类调用） */
  _emitData(data, from) {
    if (this._dataCb) this._dataCb(data, from);
    // 同时兼容旧接口 listen(cb) 作为数据回调的用法
    if (this._listener) this._listener(data);
  }

  /** 内部：触发入站连接回调（由子类调用） */
  _emitIncoming(peerDesc) {
    if (this._listener) this._listener(peerDesc);
  }
}

module.exports = { Transport };
