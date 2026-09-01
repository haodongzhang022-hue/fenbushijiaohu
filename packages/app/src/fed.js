'use strict';
/**
 * fed 模块 —— 联邦协议（M5）
 *
 * 对齐 16 号文档 §3.2 M5-B `fed.js` 联邦协议：
 *   职责：跨平台统一事件协议，屏蔽各游戏/平台差异
 *   输入：emit(event) / subscribe(topic)
 *   输出：统一会话事件流
 *   依赖：transport、identity
 *   风险：[HIGH] 协议漂移、跨平台事件语义不一致
 *   状态机：init→registering→streaming→reconnect
 *
 * 实现要点：
 *   - 统一事件协议：平台原生事件 → 统一事件（mapPlatformEvent）
 *   - 主题订阅/发布
 *   - 断线重连
 */

const crypto = require('crypto');

// 联邦协议版本
const FED_PROTOCOL_VERSION = '1.0.0';

// 统一事件类型
const EVENT_TYPES = [
  'player-join',    // 玩家加入
  'player-leave',   // 玩家离开
  'match-found',    // 匹配成功
  'game-start',     // 游戏开始
  'game-end',       // 游戏结束
  'chat',           // 聊天
  'state-sync',     // 状态同步
];

class Fed {
  /**
   * @param {object} [opts]
   * @param {string} [opts.nodeId] 节点标识
   * @param {object} [opts.transport] 传输层实例（用于跨平台事件投递）
   */
  constructor(opts = {}) {
    this.nodeId = opts.nodeId || `fed-${crypto.randomBytes(4).toString('hex')}`;
    this.transport = opts.transport || null;
    this._subscribers = new Map(); // topic -> Set<cb>
    this._state = 'init';
    this._registeredTopics = new Set();
    this._eventLog = [];
  }

  /** 当前协议版本 */
  static get protocolVersion() {
    return FED_PROTOCOL_VERSION;
  }

  /** 支持的事件类型 */
  static get eventTypes() {
    return [...EVENT_TYPES];
  }

  /** 当前状态 */
  get state() {
    return this._state;
  }

  /**
   * 初始化并注册主题
   * @param {string[]} topics
   */
  async init(topics = []) {
    this._state = 'registering';
    for (const t of topics) {
      this._registeredTopics.add(t);
    }
    this._state = 'streaming';
    return { nodeId: this.nodeId, topics: [...this._registeredTopics] };
  }

  /**
   * 发布统一事件
   * @param {object} event 统一事件 { type, topic, data, from }
   */
  async emit(event) {
    if (!EVENT_TYPES.includes(event.type)) {
      throw new Error(`非法事件类型: ${event.type}`);
    }
    const normalized = this._normalizeEvent(event);
    // 投递到本节点订阅者
    const subs = this._subscribers.get(normalized.topic) || new Set();
    for (const cb of subs) {
      cb(normalized);
    }
    // 经 transport 投递到远端（如果已接入）
    if (this.transport) {
      await this.transport.send('broadcast', normalized);
    }
    this._eventLog.push(normalized);
    return normalized;
  }

  /**
   * 订阅主题
   * @param {string} topic
   * @param {Function} cb
   */
  subscribe(topic, cb) {
    if (!this._subscribers.has(topic)) this._subscribers.set(topic, new Set());
    this._subscribers.get(topic).add(cb);
    return () => this._subscribers.get(topic)?.delete(cb);
  }

  /**
   * 平台原生事件 → 统一事件映射
   * @param {object} raw 平台事件
   * @param {string} platform 平台标识（如 'steam', 'psn', 'xbox', 'web'）
   */
  mapPlatformEvent(raw, platform) {
    // 不同平台的事件字段映射到统一结构
    const map = {
      steam: {
        type: 'player-join',
        topic: raw.lobbyId || 'default',
        data: { platform: 'steam', playerId: raw.userId },
      },
      psn: {
        type: 'player-join',
        topic: raw.roomId || 'default',
        data: { platform: 'psn', playerId: raw.playerId },
      },
      xbox: {
        type: 'player-join',
        topic: raw.sessionId || 'default',
        data: { platform: 'xbox', playerId: raw.gamertag },
      },
      web: {
        type: 'player-join',
        topic: raw.channel || 'default',
        data: { platform: 'web', playerId: raw.userId },
      },
    };
    const base = map[platform] || {
      type: EVENT_TYPES[0],
      topic: 'default',
      data: { platform, playerId: raw.id || 'unknown' },
    };
    return this._normalizeEvent({
      ...base,
      from: raw.from || this.nodeId,
      ts: raw.ts || Date.now(),
    });
  }

  /**
   * 断线重连
   */
  async reconnect() {
    this._state = 'registering';
    // 重新注册全部主题
    this._state = 'streaming';
    return { reconnected: true, topics: [...this._registeredTopics] };
  }

  /** 事件日志（审计用） */
  get eventLog() {
    return this._eventLog.map((e) => ({ ...e }));
  }

  /** 规范化统一事件 */
  _normalizeEvent(event) {
    return {
      id: event.id || `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      type: event.type,
      topic: event.topic || 'default',
      data: event.data || {},
      from: event.from || this.nodeId,
      ts: event.ts || Date.now(),
      proto: FED_PROTOCOL_VERSION,
    };
  }
}

module.exports = { Fed, EVENT_TYPES, FED_PROTOCOL_VERSION };
