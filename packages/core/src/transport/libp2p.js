'use strict';
/**
 * transport 模块 —— libp2p 适配器（Node/服务端）
 *
 * 对齐 16 号文档 §5.2 libp2p 适配器：
 *   适用：Node/守护进程节点
 *   加密：Noise 握手
 *   多路：yamux 多路复用
 *
 * 实现说明：
 *   1. 支持通过 SignalingServer 交换连接信息（multiaddr + Noise 会话密钥）
 *   2. Node 环境经内存多路流模拟 yamux 通道
 *   3. 接口契约与状态机完全遵循 Transport 抽象，真实 libp2p 接入时仅替换底层
 */

const { Transport } = require('./transport');
const crypto = require('crypto');

class Libp2pTransport extends Transport {
  /**
   * @param {string} nodeId
   * @param {object} [opts]
   * @param {string} [opts.listenAddr] 本地监听 multiaddr，如 '/ip4/0.0.0.0/tcp/0'
   * @param {string} [opts.roomId] 信令房间 id
   * @param {SignalingServer} [opts.signaling] 信令服务实例
   */
  constructor(nodeId, opts = {}) {
    super(nodeId);
    this.type = 'libp2p';
    this.listenAddr = opts.listenAddr || `/ip4/127.0.0.1/tcp/4${nodeId.length % 10}${Math.floor(Math.random() * 90)}/p2p/${nodeId}`;
    this._streams = new Map(); // peerId -> { streamId, state, buf }
    this._noise = null; // Noise 握手密钥（模拟）
    this._signaling = opts.signaling || null;
    this._roomId = opts.roomId || 'default';
    this._session = null; // SignalingSession
    this._pendingDial = new Map(); // peerId -> {resolve, reject, timeout}
  }

  /**
   * 建立与对端的连接（支持经信令交换 multiaddr）
   * @param {{id: string, addr?: string}} peer 对端描述
   * @param {SignalingSession} [signaling] 可选：已创建的信令会话
   */
  async connect(peer, signaling) {
    this._assertOpen();
    this._state = 'connecting';

    const session = signaling || this._session;
    try {
      const channel = session
        ? await this._negotiateViaSignaling(peer, session)
        : await this._negotiate(peer, signaling);
      this._state = 'open';
      this._channels.set(peer.id, channel);
      return { id: this.nodeId, peer: peer.id, state: 'open' };
    } catch (e) {
      this._state = 'idle';
      throw e;
    }
  }

  /**
   * 加入信令房间（供真实网络建连）
   * @param {string} roomId
   * @param {SignalingServer} [server]
   */
  async joinRoom(roomId, server) {
    const sigServer = server || this._signaling;
    if (!sigServer) {
      throw new Error('Libp2p 未配置信令服务');
    }
    this._roomId = roomId;
    this._session = await sigServer.join(roomId, this.nodeId);
    this._session.on('message', (msg) => {
      this._handleSignalingMessage(msg);
    });
    // 广播自己的 multiaddr
    await this._session.broadcast({
      type: 'ident',
      addr: this.listenAddr,
    });
    return this._session;
  }

  /**
   * 经信令协商（交换 multiaddr + Noise 会话密钥）
   * @private
   */
  async _negotiateViaSignaling(peer, session) {
    // 先注册等待拨号应答的 promise（避免信令异步时序问题）
    const answerPromise = this._waitForDialAnswer(peer.id, 10000);
    // 发送连接请求（含本机 multiaddr）
    await session.signal(peer.id, {
      type: 'dial',
      addr: this.listenAddr,
      noiseKey: this._genNoiseKey(peer.id),
    });
    // 等待对端应答（超时 10s）
    const answer = await answerPromise;
    // 建立 yamux 流
    const streamId = crypto.randomBytes(8).toString('hex');
    const stream = {
      id: streamId,
      peer: peer.id,
      addr: answer.addr || peer.addr,
      state: 'open',
      protocol: '/fenbushijiaohu/1.0.0',
      noise: { sessionKey: this._genNoiseKey(peer.id), establishedAt: Date.now(), viaSignaling: true },
    };
    this._streams.set(peer.id, stream);
    this._noise = stream.noise;
    return stream;
  }

  /**
   * 等待对端拨号应答（带超时）
   * @private
   */
  _waitForDialAnswer(peerId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // 超时需清理 pendingDial 条目，避免资源泄漏
        if (this._pendingDial.has(peerId)) {
          clearTimeout(this._pendingDial.get(peerId).timeout);
          this._pendingDial.delete(peerId);
        }
        reject(new Error(`libp2p 等待 ${peerId} 的拨号应答超时`));
      }, timeoutMs);
      this._pendingDial.set(peerId, { resolve, reject, timeout });
    });
  }

  /**
   * 处理来自信令的消息
   * @private
   */
  _handleSignalingMessage(msg) {
    const { from, payload } = msg;
    const data = payload || {};
    if (data.type === 'data') {
      // 经信令的数据投递（评审回归：信令数据通路不再断裂）
      this._emitData(data.payload, from);
    } else if (data.type === 'dial') {
      // 对端请求拨号，回应答（含本机 multiaddr）
      const answer = {
        type: 'dial-answer',
        addr: this.listenAddr,
        noiseKey: this._genNoiseKey(from),
      };
      this._session.signal(from, { type: 'dial-answer', ...answer });
      // 建立入站流
      const streamId = crypto.randomBytes(8).toString('hex');
      const stream = {
        id: streamId,
        peer: from,
        addr: data.addr,
        state: 'open',
        protocol: '/fenbushijiaohu/1.0.0',
        noise: { sessionKey: this._genNoiseKey(from), establishedAt: Date.now(), viaSignaling: true },
      };
      this._streams.set(from, stream);
      this._emitIncoming({ id: from, type: 'libp2p', addr: data.addr });
    } else if (data.type === 'dial-answer') {
      // 对端应答，解析 pending dial
      const pending = this._pendingDial.get(from);
      if (pending) {
        clearTimeout(pending.timeout);
        this._pendingDial.delete(from);
        pending.resolve({ addr: data.addr, noiseKey: data.noiseKey });
      }
    }
  }

  /**
   * 底层协商：模拟 libp2p 拨号 + Noise 握手
   * @protected
   */
  async _negotiate(peer, signaling) {
    const peerAddr = peer.addr || `/ip4/127.0.0.1/tcp/9${peer.id.length % 10}${Math.floor(Math.random() * 90)}/p2p/${peer.id}`;
    this._noise = {
      sessionKey: this._genNoiseKey(peer.id),
      establishedAt: Date.now(),
    };
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
   * 生成 Noise 会话密钥（模拟）
   * @private
   */
  _genNoiseKey(peerId) {
    return crypto.createHash('sha256')
      .update(`${this.nodeId}:${peerId}:${Date.now()}`)
      .digest('hex').slice(0, 32);
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
    // 若经信令连接，经信令投递数据
    if (this._session && stream.noise && stream.noise.viaSignaling) {
      await this._session.signal(peerId, { type: 'data', payload: chunk });
      return true;
    }
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
      viaSignaling: !!(s.noise && s.noise.viaSignaling),
    }));
  }

  /**
   * 关闭传输
   */
  close() {
    super.close();
    this._streams.clear();
    this._pendingDial.clear();
    if (this._session) {
      this._session.removeAllListeners('message');
    }
  }

  /** 底层是否支持（Node 环境默认支持） */
  static isSupported() {
    return typeof process !== 'undefined' &&
      typeof process.versions !== 'undefined' &&
      !!process.versions.node;
  }
}

module.exports = { Libp2pTransport };
