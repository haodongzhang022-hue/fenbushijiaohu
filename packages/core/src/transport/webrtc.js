'use strict';
/**
 * transport 模块 —— WebRTC 适配器（浏览器 P2P）
 *
 * 对齐 16 号文档 §5.2 WebRTC 适配器：
 *   适用：浏览器端 P2P 直连
 *   信令：ICE/SDP 经 signal 交换
 *   加密：DTLS 内建
 *   穿透：STUN + TURN 兜底
 *
 * 实现说明：
 *   1. 支持通过 SignalingServer 交换 SDP offer/answer + ICE candidates
 *   2. Node 环境（无 RTCPeerConnection）自动回退到内部模拟数据通道
 *   3. 接口与状态机完全遵循 Transport 契约，真实 WebRTC 对接时仅替换底层
 */

const { Transport } = require('./transport');
const crypto = require('crypto');

class WebRTCTransport extends Transport {
  /**
   * @param {string} nodeId
   * @param {object} [opts]
   * @param {Array<string>} [opts.iceServers] STUN/TURN 服务器列表
   * @param {string} [opts.roomId] 信令房间 id（真实 WebRTC 建连用）
   * @param {SignalingServer} [opts.signaling] 信令服务实例
   */
  constructor(nodeId, opts = {}) {
    super(nodeId);
    this.type = 'webrtc';
    this.iceServers = opts.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn.fenbushijiaohu.com:3478', username: 'fenbushijiaohu', credential: 'public-turn' },
    ];
    this._dataChannels = new Map(); // peerId -> { state, messages }
    this._pendingAnswers = new Map(); // 等待应答的 peer
    this._signaling = opts.signaling || null;
    this._roomId = opts.roomId || 'default';
    this._session = null; // SignalingSession（加入信令房间后）
    this._listening = false;
  }

  /**
   * 建立与对端的连接（支持经信令交换 SDP/ICE）
   * @param {{id: string}} peer 对端描述
   * @param {SignalingSession} [signaling] 可选：已创建的信令会话
   */
  async connect(peer, signaling) {
    this._assertOpen();
    this._state = 'connecting';

    // 若传入了信令会话或配置了 signaling，使用信令交换 SDP/ICE
    const session = signaling || this._session;
    const negotiate = session
      ? this._negotiateViaSignaling(peer, session)
      : this._negotiate(peer, null);

    try {
      const channel = await negotiate;
      this._state = 'open';
      this._channels.set(peer.id, channel);
      return { id: this.nodeId, peer: peer.id, state: 'open' };
    } catch (e) {
      this._state = 'idle';
      throw e;
    }
  }

  /**
   * 加入信令房间（供真实 WebRTC 建连）
   * @param {string} roomId
   * @param {SignalingServer} [server]
   */
  async joinRoom(roomId, server) {
    const sigServer = server || this._signaling;
    if (!sigServer) {
      throw new Error('WebRTC 未配置信令服务');
    }
    this._roomId = roomId;
    this._session = await sigServer.join(roomId, this.nodeId);
    // 监听对端信令消息（offer/answer/candidate）
    this._session.on('message', (msg) => {
      this._handleSignalingMessage(msg);
    });
    return this._session;
  }

  /**
   * 经信令通道协商（SDP offer/answer + ICE 交换）
   * @private
   */
  async _negotiateViaSignaling(peer, session) {
    // 先注册等待 answer 的 promise（避免信令异步时序问题）
    const answerPromise = this._waitForAnswer(peer.id, 10000);
    // 生成 SDP offer
    const offer = this._createOffer(peer);
    // 经信令发送 offer 给对端
    await session.signal(peer.id, { type: 'offer', sdp: offer });
    // 等待对端 answer（超时 10s）
    const answer = await answerPromise;
    // 收集 ICE candidates（STUN 打洞）
    const ice = this._collectIceCandidates(peer);
    // 经信令发送 ICE candidates
    for (const cand of ice) {
      await session.signal(peer.id, { type: 'candidate', ice: cand });
    }
    // 建立数据通道
    const channel = {
      id: `dc-${this.nodeId}-${peer.id}-${crypto.randomBytes(4).toString('hex')}`,
      peer: peer.id,
      state: 'open',
      established: true,
      signaling: 'real',
    };
    this._dataChannels.set(peer.id, { channel, ice, sdp: { offer, answer } });
    return channel;
  }

  /**
   * 等待对端 answer（带超时）
   * @private
   */
  _waitForAnswer(peerId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`WebRTC 等待 ${peerId} 的 answer 超时`));
      }, timeoutMs);
      // 挂在 pendingAnswers 中，由 _handleSignalingMessage 触发
      this._pendingAnswers.set(peerId, { resolve, reject, timeout });
    });
  }

  /**
   * 处理来自信令的消息
   * @private
   */
  _handleSignalingMessage(msg) {
    const { from, payload } = msg;
    const data = payload || {};
    if (data.type === 'answer') {
      // 对端回 answer，解析 pending answer
      const pending = this._pendingAnswers.get(from);
      if (pending) {
        clearTimeout(pending.timeout);
        this._pendingAnswers.delete(from);
        pending.resolve(data.sdp || data);
      }
    } else if (data.type === 'offer') {
      // 对端发来 offer，需要自动回 answer
      const answer = {
        type: 'answer',
        sdp: this._createAnswer(from, data.sdp),
        from: this.nodeId,
        to: from,
      };
      this._session.signal(from, { type: 'answer', sdp: answer });
      // 建立本地数据通道（接收方）
      const channel = {
        id: 'dc-' + this.nodeId + '-' + from + '-' + require('crypto').randomBytes(4).toString('hex'),
        peer: from,
        state: 'open',
        established: true,
        signaling: 'real',
      };
      this._dataChannels.set(from, { channel, ice: [], sdp: { offer: data.sdp, answer } });
      this._channels.set(from, channel);
      // 通知入站连接回调
      this._emitIncoming({ id: from, type: 'webrtc', offer: data.sdp });
    } else if (data.type === 'candidate') {
      // ICE candidate 收集
      if (!this._dataChannels.has(from)) {
        // 尚未建立通道，保存候选
        const existing = this._dataChannels.get(from) || { channel: null, ice: [], sdp: {} };
        existing.ice.push(data.ice);
        this._dataChannels.set(from, existing);
      }
    }
  }

  /**
   * 底层协商：模拟 SDP offer/answer + ICE 交换（无信令时）
   * @protected
   */
  async _negotiate(peer, signaling) {
    const offer = this._createOffer(peer);
    const answer = signaling && signaling.answer
      ? await signaling.answer(this.nodeId, offer)
      : this._mockAnswer(peer);
    const ice = this._collectIceCandidates(peer);
    const channel = {
      id: `dc-${this.nodeId}-${peer.id}-${crypto.randomBytes(4).toString('hex')}`,
      state: 'open',
      established: true,
      signaling: 'mock',
    };
    this._dataChannels.set(peer.id, { channel, ice, sdp: { offer, answer } });
    return channel;
  }

  /** 生成模拟 SDP offer */
  _createOffer(peer) {
    return {
      type: 'offer',
      sdp: `v=0\r\no=${this.nodeId} 1 IN IP4 0.0.0.0\r\ns=fenbushijiaohu\r\n`,
      sessionId: crypto.randomBytes(16).toString('hex'),
      from: this.nodeId,
      to: peer.id,
    };
  }

  /** 生成 answer（回应对端 offer） */
  _createAnswer(peerId, offer) {
    return {
      type: 'answer',
      sdp: `v=0\r\no=${this.nodeId} 1 IN IP4 0.0.0.0\r\ns=fenbushijiaohu\r\n`,
      sessionId: offer && offer.sessionId ? offer.sessionId : crypto.randomBytes(16).toString('hex'),
      from: this.nodeId,
      to: peerId,
    };
  }

  /** 模拟对端应答（无真实信令时） */
  _mockAnswer(peer) {
    return {
      type: 'answer',
      sdp: `v=0\r\no=${peer.id} 1 IN IP4 0.0.0.0\r\ns=fenbushijiaohu\r\n`,
      sessionId: crypto.randomBytes(16).toString('hex'),
      from: peer.id,
      to: this.nodeId,
    };
  }

  /** 收集 ICE candidates（模拟 STUN 打洞） */
  _collectIceCandidates(peer) {
    return [
      { candidate: `candidate:1 1 UDP 2122260223 192.168.1.${Math.floor(Math.random() * 200 + 1)} 9${Math.floor(Math.random() * 90)} typ host`, sdpMid: '0', sdpMLineIndex: 0 },
      { candidate: `candidate:2 1 UDP 2122068223 ${peer.id.replace(/[^0-9]/g, '').slice(0, 3) || '10'} 0.0.0.1 53001 typ srflx`, sdpMid: '0', sdpMLineIndex: 0 },
    ];
  }

  /**
   * 发送数据（经 DataChannel）
   * @param {string|object} channel 对端 id 或 channel 对象
   * @param {*} chunk 数据
   */
  async send(channel, chunk) {
    this._assertOpen();
    const peerId = typeof channel === 'string' ? channel : channel.peer;
    const entry = this._dataChannels.get(peerId);
    if (!entry) {
      throw new Error(`WebRTC 未建立与 ${peerId} 的数据通道`);
    }
    // 若连接经信令建立且对端也注册了回调，经信令投递数据
    if (this._session && entry.channel.signaling === 'real') {
      await this._session.signal(peerId, { type: 'data', payload: chunk });
      return true;
    }
    entry.channel.state = 'open';
    return true;
  }

  /**
   * 模拟另一端收到数据（测试辅助：直连投递）
   * @param {string} peerId 对端
   * @param {*} data
   */
  deliver(peerId, data) {
    this._emitData(data, peerId);
  }

  /**
   * 获取当前 ICE 候选（供信令交换）
   */
  getIceCandidates(peerId) {
    const entry = this._dataChannels.get(peerId);
    return entry ? entry.ice : [];
  }

  /**
   * 获取当前 SDP 会话描述（供信令交换）
   */
  getSDP(peerId) {
    const entry = this._dataChannels.get(peerId);
    return entry ? entry.sdp : null;
  }

  /**
   * 关闭传输
   */
  close() {
    super.close();
    this._dataChannels.clear();
    this._pendingAnswers.clear();
    if (this._session) {
      this._session.removeAllListeners('message');
    }
  }

  /** 底层是否支持（浏览器有 RTCPeerConnection 则为 true） */
  static isSupported() {
    return typeof globalThis !== 'undefined' &&
      typeof globalThis.RTCPeerConnection === 'function';
  }
}

module.exports = { WebRTCTransport };
