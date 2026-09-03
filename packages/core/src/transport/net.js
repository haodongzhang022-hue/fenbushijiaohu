'use strict';
/**
 * transport 模块 —— 真实 TCP 传输适配器（localhost / 回环真实套接字）
 *
 * 定位：把传输层从「纯内存模拟」推进到「真实 OS socket 网络」的第一步——
 * 使用 Node 内置 `net` 模块在本地回环上建立**真实 TCP 连接**，可插拔接入
 * 统一 Transport 接口契约。CI / 单机环境即可验证真实套接字收发，无需外网。
 *
 * 对齐 16 号文档 §5 真实传输层设计：
 *   - 真实传输应从"内存模拟"演进为"真实套接字"，为 WebRTC/libp2p 接入铺垫；
 *   - 本适配器复用统一 Transport 接口（connect/listen/send/onData/close），
 *     后续替换为真实 WebRTC/libp2p 底层时上层代码零改动。
 *
 * 网络协议（回环真实 TCP）：
 *   - 每节点一个 net.Server，监听 localhost 的临时端口；
 *   - 数据帧格式：[4字节大端长度][UTF-8 JSON payload]；
 *   - 建连握手：拨号方发 {type:'handshake'}，被叫方回 {type:'handshake-ack'}，
 *     双方据此登记 peer 身份与套接字，此后进入普通数据帧。
 */

const net = require('net');
const { Transport } = require('./transport');

/** 帧编解码：长度前缀（4字节大端）+ JSON 载荷 */
function encodeFrame(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

/**
 * 真实 TCP 回环传输适配器
 */
class NetTransport extends Transport {
  /**
   * @param {string} nodeId 本地节点标识
   * @param {object} [opts]
   * @param {boolean} [opts.autoListen] 构造时是否自动监听回环端口（默认 true）
   * @param {object} [opts.registry] 节点地址注册表 { nodeId -> {host,port} }（测试注入共享）
   */
  constructor(nodeId, opts = {}) {
    super(nodeId);
    this.type = 'net';
    this.host = opts.host || '127.0.0.1';
    this._registry = opts.registry || null; // 共享地址簿
    this._server = null;
    this._port = null;
    this._sockets = new Map();              // peerId -> net.Socket
    this._buffers = new Map();              // peerId -> Buffer（半包拼接）
    this._ready = false;
    if (opts.autoListen !== false) {
      this._listen();
    }
  }

  /** 已监听的真实端口 */
  get port() {
    return this._port;
  }

  /** 真实网络是否就绪 */
  get isNetworkReady() {
    return this._ready;
  }

  /** 等待监听就绪 */
  _whenReady() {
    return new Promise((resolve) => {
      if (this._ready) return resolve();
      const iv = setInterval(() => {
        if (this._ready) { clearInterval(iv); resolve(); }
      }, 2);
      // 上限保护
      setTimeout(() => { clearInterval(iv); }, 2000);
    });
  }

  /**
   * 建立回环监听（net.Server）
   * @private
   */
  _listen() {
    this._server = net.createServer((socket) => {
      socket.on('data', (chunk) => this._onInboundChunk(socket, chunk));
      socket.on('error', () => { /* 对端断开忽略 */ });
    });
    this._server.listen(0, this.host, () => {
      this._port = this._server.address().port;
      this._ready = true;
      if (this._registry) {
        this._registry[this.nodeId] = { host: this.host, port: this._port };
      }
    });
  }

  /**
   * 被叫侧：处理入站套接字数据，先完成握手再转普通数据
   * @private
   */
  _onInboundChunk(socket, chunk) {
    const sid = socket.__sockId || (socket.__sockId = `s${Math.random().toString(36).slice(2)}`);
    const key = socket.__peerId || `hs-${sid}`;
    const buf = Buffer.concat([(this._buffers.get(key) || Buffer.alloc(0)), chunk]);
    this._buffers.set(key, buf);
    // 尝试解码当前累积缓冲
    this._decodeInbound(socket, key);
  }

  /**
   * 尝试解析被叫侧缓冲中的完整帧
   * @private
   */
  _decodeInbound(socket, key) {
    let buf = this._buffers.get(key) || Buffer.alloc(0);
    // 若尚未握手，先尝试解析握手帧
    if (!socket.__peerId) {
      const hs = this._extractFrame(buf);
      if (!hs) { this._buffers.set(key, buf); return; }
      if (hs.msg.type === 'handshake') {
        const peerId = hs.msg.from;
        socket.__peerId = peerId;
        this._registerInbound(peerId, socket);
        socket.write(encodeFrame({ type: 'handshake-ack', from: this.nodeId, to: peerId }));
        buf = hs.rest;
        this._buffers.set(key, buf);
        this._decodeInbound(socket, key); // 继续处理握手后可能紧邻的数据
        return;
      }
    }
    this._decodePayloads(socket, key);
  }

  /**
   * 从缓冲前部提取一个完整帧（不足则返回 null）
   * @private
   */
  _extractFrame(buf) {
    if (buf.length < 4) return null;
    const len = buf.readUInt32BE(0);
    if (buf.length < 4 + len) return null;
    const body = JSON.parse(buf.slice(4, 4 + len).toString('utf8'));
    return { msg: body, rest: buf.slice(4 + len) };
  }

  /**
   * 主叫侧：解析握手后普通数据帧
   * @private
   */
  _decodePayloads(socket, key) {
    let buf = this._buffers.get(key) || Buffer.alloc(0);
    while (buf.length >= 4) {
      const len = buf.readUInt32BE(0);
      if (buf.length < 4 + len) break;
      const body = JSON.parse(buf.slice(4, 4 + len).toString('utf8'));
      this._emitData({ ...body, receivedAt: Date.now() }, body.from || socket.__peerId);
      buf = buf.slice(4 + len);
    }
    this._buffers.set(key, buf);
  }

  /**
   * 建立与对端的真实 TCP 连接（回环拨号）
   * @param {{id: string, host?: string, port?: number}} peer 对端描述
   * @param {object} [addrBook] 地址簿：{ [peerId]: {host,port} }
   */
  async connect(peer, addrBook) {
    this._assertOpen();
    await this._whenReady();
    this._state = 'connecting';
    const target = addrBook?.[peer.id] ||
      (this._registry?.[peer.id]) ||
      { host: peer.host, port: peer.port };
    if (!target || !target.port) {
      this._state = 'idle';
      throw new Error(`找不到对端 ${peer.id} 的地址`);
    }
    try {
      await this._dial(target.host, target.port, peer.id);
      this._channels.set(peer.id, { id: `net-${this.nodeId}-${peer.id}`, peer: peer.id, state: 'open' });
      this._state = 'open';
      return { id: this.nodeId, peer: peer.id, state: 'open' };
    } catch (e) {
      this._state = 'idle';
      throw e;
    }
  }

  /**
   * 建立一条真实 TCP 客户端连接并完成握手
   * @private
   */
  _dial(host, port, peerId) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, host, () => {
        socket.write(encodeFrame({ type: 'handshake', from: this.nodeId, to: peerId }));
      });
      socket.on('error', reject);
      const key = `hs-${this.nodeId}-${peerId}`;
      socket.on('data', (chunk) => {
        const buf = Buffer.concat([(this._buffers.get(key) || Buffer.alloc(0)), chunk]);
        this._buffers.set(key, buf);
        const frame = this._extractFrame(buf);
        if (frame && frame.msg.type === 'handshake-ack') {
          socket.setTimeout(0);
          socket.__peerId = peerId;
          this._sockets.set(peerId, socket);
          this._buffers.delete(key);
          this._buffers.set(peerId, frame.rest); // 处理可能紧邻到达的数据
          socket.removeAllListeners('data');
          socket.on('data', (chunk2) => {
            const pend = this._buffers.get(peerId) || Buffer.alloc(0);
            this._buffers.set(peerId, Buffer.concat([pend, chunk2]));
            this._decodePayloads(socket, peerId);
          });
          // 立即处理已缓冲的对端数据
          const pending = this._buffers.get(peerId);
          if (pending && pending.length) {
            this._decodePayloads(socket, peerId);
          }
          resolve();
        } else {
          this._buffers.set(key, buf);
        }
      });
      socket.setTimeout(3000, () => {
        socket.destroy(new Error('TCP 握手超时'));
      });
    });
  }

  /**
   * 向对端发送一条消息（写入真实 TCP 套接字）
   * @param {string} peerId 对端节点 id
   * @param {object} msg 消息载荷
   */
  async send(peerId, msg) {
    this._assertOpen();
    const socket = this._sockets.get(peerId);
    if (!socket || socket.destroyed) {
      throw new Error(`未建立与 ${peerId} 的真实 TCP 连接`);
    }
    const frame = encodeFrame({ from: this.nodeId, to: peerId, ...msg });
    socket.write(frame);
    return true;
  }

  /**
   * 被叫侧登记拨入方连接
   * @private
   */
  _registerInbound(peerId, socket) {
    this._sockets.set(peerId, socket);
    this._channels.set(peerId, { id: `net-${this.nodeId}-${peerId}`, peer: peerId, state: 'open' });
  }

  /**
   * 关闭真实 TCP 传输
   */
  close() {
    this._state = 'closed';
    for (const socket of this._sockets.values()) {
      try { socket.destroy(); } catch { /* ignore */ }
    }
    this._sockets.clear();
    this._buffers.clear();
    if (this._server) {
      try { this._server.close(); } catch { /* ignore */ }
      this._server = null;
    }
    this._ready = false;
    super.close();
  }
}

module.exports = { NetTransport, encodeFrame };
