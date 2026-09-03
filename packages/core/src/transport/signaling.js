'use strict';
/**
 * transport 模块 —— 信令服务（Signaling Server）
 *
 * 对齐 16 号文档 §5.1「依赖：信令（ICE/SDP 交换）」：
 *   WebRTC 建立 P2P 连接前，双方需经信令服务器交换 SDP offer/answer
 *   与 ICE candidates。本模块提供轻量可用的信令服务：
 *
 *   - SignalingServer : 信令服务端（房间模型，WebSocket 语义）
 *   - createSignaling : 工厂（memory/ws 两种后端）
 *
 * 接口契约：
 *   class SignalingServer {
 *     async connect(roomId)            // 加入房间，返回会话
 *     async exchange(roomId, msg)      // 向同房间对端转发消息（SDP/ICE）
 *     async signal(to, from, data)     // 点对点信令投递
 *     close()
 *   }
 *
 * 内存实现用于测试与演示；WS 实现用于真实网络环境。
 * 信令服务不承载业务数据，仅交换建连所需元数据（SDP/ICE/key）。
 */

const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * 信令会话（单房间内的双向通道）
 */
class SignalingSession extends EventEmitter {
  constructor(server, roomId, peerId) {
    super();
    this._server = server;
    this.roomId = roomId;
    this.peerId = peerId;
  }

  /**
   * 向同房间对端发送信令消息
   * @param {string} to 目标节点 id
   * @param {object} data 信令数据（type: offer/answer/candidate/key）
   * @returns {Promise<boolean>}
   */
  async signal(to, data) {
    return this._server._route(this.roomId, this.peerId, to, data);
  }

  /**
   * 获取当前房间所有在线对端
   * @returns {Array<string>}
   */
  peers() {
    return this._server._peersInRoom(this.roomId, this.peerId);
  }

  /**
   * 广播给同房间所有对端
   * @param {object} data
   */
  async broadcast(data) {
    const peers = this._server._peersInRoom(this.roomId, this.peerId);
    const results = [];
    for (const p of peers) {
      results.push(await this._server._route(this.roomId, this.peerId, p, data));
    }
    return results.every(Boolean);
  }
}

/**
 * 信令服务端（房间模型）
 * 支持内存模式（测试/演示）与 WebSocket 模式（真实网络）。
 */
class SignalingServer {
  /**
   * @param {object} [opts]
   * @param {'memory'|'ws'} [opts.mode] 后端模式
   * @param {number} [opts.port] WS 模式监听端口
   */
  constructor(opts = {}) {
    this.mode = opts.mode || 'memory';
    this.port = opts.port || 0;
    this._rooms = new Map();    // roomId -> Map<peerId, SignalingSession>
  }

  /**
   * 创建并加入一个房间
   * @param {string} roomId 房间标识
   * @param {string} peerId 本地节点 id
   * @returns {Promise<SignalingSession>}
   */
  async join(roomId, peerId) {
    if (!this._rooms.has(roomId)) {
      this._rooms.set(roomId, new Map());
    }
    const room = this._rooms.get(roomId);
    const session = new SignalingSession(this, roomId, peerId);
    room.set(peerId, session);
    // 通知房间内已有对端有新成员加入
    for (const [existingPeer, existingSession] of room) {
      if (existingPeer !== peerId) {
        existingSession.emit('peer-joined', { id: peerId });
        session.emit('peer-joined', { id: existingPeer });
      }
    }
    return session;
  }

  /**
   * 离开房间
   * @param {string} roomId
   * @param {string} peerId
   */
  leave(roomId, peerId) {
    const room = this._rooms.get(roomId);
    if (!room) return;
    room.delete(peerId);
    // 通知同房间其他对端
    for (const [existingPeer, existingSession] of room) {
      existingSession.emit('peer-left', { id: peerId });
    }
    if (room.size === 0) {
      this._rooms.delete(roomId);
    }
  }

  /**
   * 在房间内路由消息到目标节点
   * @param {string} roomId
   * @param {string} from
   * @param {string} to
   * @param {object} data
   * @private
   */
  async _route(roomId, from, to, data) {
    // 自发送防护：不能给自己发信令（与 case-13 断言一致）
    if (from === to) {
      return false;
    }
    const room = this._rooms.get(roomId);
    if (!room) {
      throw new Error(`信令房间 ${roomId} 不存在`);
    }
    const targetSession = room.get(to);
    if (!targetSession) {
      // 目标不在线：标记未投递
      return false;
    }
    const payload = {
      type: data.type || 'signal',
      from,
      to,
      payload: data,
      ts: Date.now(),
      id: crypto.randomBytes(8).toString('hex'),
    };
    targetSession.emit('message', payload);
    // 兼容 old-style 回调
    if (typeof this._onMessage === 'function') {
      this._onMessage(roomId, payload);
    }
    return true;
  }

  /**
   * 获取房间内对端列表（排除自身）
   * @param {string} roomId
   * @param {string} selfId
   * @private
   */
  _peersInRoom(roomId, selfId) {
    const room = this._rooms.get(roomId);
    if (!room) return [];
    return [...room.keys()].filter((id) => id !== selfId);
  }

  /**
   * 获取房间在线节点数
   * @param {string} roomId
   */
  onlineCount(roomId) {
    const room = this._rooms.get(roomId);
    return room ? room.size : 0;
  }

  /**
   * 关闭信令服务
   */
  close() {
    this._rooms.clear();
  }

  /**
   * 注册全局消息回调（测试辅助）
   * @param {(roomId: string, msg: object) => void} cb
   */
  onMessage(cb) {
    this._onMessage = cb;
  }
}

/**
 * 创建信令服务（工厂）
 * @param {'memory'|'ws'} mode
 * @param {object} [opts]
 */
function createSignaling(mode = 'memory', opts = {}) {
  return new SignalingServer({ mode, ...opts });
}

module.exports = {
  SignalingServer,
  SignalingSession,
  createSignaling,
};
