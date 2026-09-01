'use strict';
/**
 * transport 模块 —— libp2p 适配器（Node/服务端）
 *
 * 对齐 16 号文档 §5.2 libp2p 适配器：
 *   适用：Node/守护进程节点
 *   加密：Noise 握手
 *   多路：yamux 多路复用
 *
 * 实现说明：libp2p 真实能力依赖 @libp2p/* 系列 npm 包。本适配器提供统一
 * Transport 契约 + 可测的拨号/流/加密骨架：
 *   - _negotiate(peer)：模拟 libp2p 拨号（multiaddr 解析 + Noise 握手）
 *   - _openStream：模拟 yamux 多路复用流
 *   - send/onData：经 stream 传送
 *
 * 在不依赖外部 npm 包的当前项目中，以「内存多路流」模拟 yamux 通道，
 * 但接口契约与状态机完全遵循 Transport 抽象，真实 libp2p 接入时仅替换底层。
 */

const { Transport } = require('./transport');
const crypto = require('crypto');

class Libp2pTransport extends Transport {
  /**
   * @param {string} nodeId
   * @param {object} [opts]
   * @param {string} [opts.listenAddr] 本地监听 multiaddr，如 '/ip4/0.0.0.0/tcp/0'
   */
  constructor(nodeId, opts = {}) {
    super(nodeId);
    this.type = 'libp2p';
    this.listenAddr = opts.listenAddr || `/ip4/127.0.0.1/tcp/4${nodeId.length % 10}${Math.floor(Math.random() * 90)}`;
    this._streams = new Map(); // peerId -> { streamId, state, buf }
    this._noise = null; // Noise 握手密钥（模拟）
  }

  /**
   * 底层协商：模拟 libp2p 拨号 + Noise 握手
   * @protected
   */
  async _negotiate(peer, signaling) {
    // 解析 multiaddr（模拟）
    const peerAddr = peer.addr || `/ip4/127.0.0.1/tcp/9${peer.id.length % 10}${Math.floor(Math.random() * 90)}/p2p/${peer.id}`;
    // Noise 握手（模拟：生成会话密钥）
    this._noise = {
      sessionKey: crypto.createHash('sha256').update(`${this.nodeId}:${peer.id}`).digest('hex').slice(0, 32),
      establishedAt: Date.now(),
    };
    // 打开 yamux 多路流
    const streamId = crypto.randomBytes(8).toString('hex');
    const stream = {
      id: streamId,
      peer: peer.id,
      addr: peerAddr,
      state: 'open',
      protocol: '/fenbushijiaohu/1.0.0',
      noise: this._noise,
    };
    this._streams.set(peer.id, stream);
    return stream;
  }

  /**
   * 发送数据（经 yamux 流）
   * @param {string|object} channel 对端 id 或 stream 对象
   * @param {*} chunk 数据
   */
  async send(channel, chunk) {
    this._assertOpen();
    const peerId = typeof channel === 'string' ? channel : channel.peer;
    const stream = this._streams.get(peerId);
    if (!stream) {
      throw new Error(`libp2p 未建立与 ${peerId} 的流`);
    }
    // 模拟经流发送
    stream.state = 'open';
    return true;
  }

  /**
   * 模拟对端收到数据（测试辅助）
   * @param {string} peerId
   * @param {*} data
   */
  deliver(peerId, data) {
    this._emitData(data, peerId);
  }

  /** 获取当前活跃流列表 */
  get streams() {
    return [...this._streams.values()].map((s) => ({
      id: s.id,
      peer: s.peer,
      protocol: s.protocol,
      state: s.state,
    }));
  }

  /** 底层是否支持（Node 环境默认支持） */
  static isSupported() {
    return typeof process !== 'undefined' &&
      typeof process.versions !== 'undefined' &&
      !!process.versions.node;
  }
}

module.exports = { Libp2pTransport };
