'use strict';
/**
 * session 模块 —— 会话 + 消息条 + CRDT 收敛（M1 最小实现）
 *
 * 架构师接口契约（04 §3.2）：
 *   interface Message {
 *     id: string;          // 内容哈希
 *     sender: string;      // 发送者 pubKey
 *     channelId: string;   // 频道
 *     type: 'text'|'media'|'game-cmd'|'task';
 *     payload: string;
 *     ts: number;          // Lamport/逻辑时钟（CRDT 收敛用）
 *   }
 *
 * 收敛规则（LWW-Element-Set 语义）：
 *   - 每条消息以 (channelId, id) 为唯一键；
 *   - 同键冲突时取 ts 较大者胜出（Lamport 时钟 + 节点序号 tie-break）；
 *   - 追加/合并对方消息后，本地视图与远端收敛到同一消息序列。
 */
const crypto = require('crypto');

// 消息类型白名单
const MSG_TYPES = ['text', 'media', 'game-cmd', 'task'];

class Session {
  /**
   * @param {string} localPubKey 本地身份公钥
   * @param {string} channelId   会话频道
   */
  constructor(localPubKey, channelId) {
    this.localPubKey = localPubKey;
    this.channelId = channelId;
    this._clock = 0;                       // Lamport 逻辑时钟
    this._messages = new Map();            // key = `${channelId}:${id}`
  }

  /** 当前 Lamport 时钟 */
  get clock() {
    return this._clock;
  }

  /** 按时间序返回已收敛消息列表 */
  get messages() {
    return [...this._messages.values()].sort((a, b) =>
      a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : 1)
    );
  }

  /**
   * 生成一条消息（本地发送）
   * @param {string} payload
   * @param {string} [type]
   */
  send(payload, type = 'text') {
    if (!MSG_TYPES.includes(type)) {
      throw new Error(`非法消息类型: ${type}`);
    }
    this._clock += 1;
    const id = this._contentHash(payload, this._clock);
    const msg = {
      id,
      sender: this.localPubKey,
      channelId: this.channelId,
      type,
      payload,
      ts: this._clock,
    };
    this._merge(msg);       // 本地先落地
    return msg;
  }

  /**
   * 合并一条远端消息（CRDT 收敛）
   * @param {Message} msg
   */
  merge(msg) {
    if (!msg || msg.channelId !== this.channelId) return false;
    if (!MSG_TYPES.includes(msg.type)) return false;
    // 推进逻辑时钟
    this._clock = Math.max(this._clock, msg.ts) + 1;
    return this._merge(msg);
  }

  /**
   * 内部合并：同键取 ts 更大（Lamport + id tie-break）
   */
  _merge(msg) {
    const key = `${msg.channelId}:${msg.id}`;
    const existing = this._messages.get(key);
    if (!existing) {
      this._messages.set(key, msg);
      return true;
    }
    // LWW：ts 大者胜；ts 相等时按 id 字典序（确定性 tie-break）
    if (msg.ts > existing.ts || (msg.ts === existing.ts && msg.id < existing.id)) {
      this._messages.set(key, msg);
      return true;
    }
    return false;
  }

  /** 内容哈希，用作消息 id（内容寻址） */
  _contentHash(payload, ts) {
    return crypto
      .createHash('sha256')
      .update(`${this.channelId}|${this.localPubKey}|${ts}|${payload}`)
      .digest('hex')
      .slice(0, 32);
  }
}

module.exports = { Session, MSG_TYPES };
