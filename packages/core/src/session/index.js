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
 *
 * P2-03/P2-05 修复：
 *   - merge() 校验字段完整性（id/sender/payload/ts 必须齐全合法）
 *   - 可选接入身份签名：构造时注入 { sign, verify } 能力后，
 *     send() 为本地消息附加 sig，merge() 对远端带 sig 消息做 sender 验签，
 *     未签名 / 伪造 sender 的消息被拒绝并返回 false。
 */
const crypto = require('crypto');

// 消息类型白名单
const MSG_TYPES = ['text', 'media', 'game-cmd', 'task'];

// merge 所需的最小必填字段
const REQUIRED_FIELDS = ['id', 'sender', 'channelId', 'type', 'payload', 'ts'];

class Session {
  /**
   * @param {string} localPubKey 本地身份公钥
   * @param {string} channelId   会话频道
   * @param {object} [opts]      可选：签名/验签能力注入
   * @param {Function} [opts.sign]   (canonical: string) => string base64 签名（本地消息用）
   * @param {Function} [opts.verify] (pubKey, canonical: string, sig: string) => boolean（远端消息验签）
   */
  constructor(localPubKey, channelId, opts = {}) {
    this.localPubKey = localPubKey;
    this.channelId = channelId;
    this._sign = typeof opts.sign === 'function' ? opts.sign : null;
    this._verify = typeof opts.verify === 'function' ? opts.verify : null;
    this._clock = 0;                       // Lamport 逻辑时钟
    this._messages = new Map();            // key = `${channelId}:${id}`
  }

  /** 当前 Lamport 时钟 */
  get clock() {
    return this._clock;
  }

  /** 是否启用了签名能力 */
  get signingEnabled() {
    return this._sign !== null;
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
    if (typeof payload !== 'string') {
      throw new TypeError(`send() payload 必须是字符串，收到 ${typeof payload}`);
    }
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
    // 若注入 sign 能力，为本地消息附加签名（P2-03）
    if (this._sign) {
      msg.sig = this._sign(this._canonical(msg));
    }
    this._merge(msg);       // 本地先落地
    return msg;
  }

  /**
   * 合并一条远端消息（CRDT 收敛）
   * @param {Message} msg
   * @returns {boolean} 是否接受并合并
   */
  merge(msg) {
    // P2-05 修复：字段完整性校验，畸形消息直接拒绝
    if (!this._validateFields(msg)) return false;
    if (!this._validateSignature(msg)) return false;
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

  /**
   * P2-05：字段完整性校验
   * @private
   */
  _validateFields(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.channelId !== this.channelId) return false;
    if (!MSG_TYPES.includes(msg.type)) return false;
    for (const f of REQUIRED_FIELDS) {
      const v = msg[f];
      if (v === undefined || v === null || v === '') return false;
    }
    // 类型约束：id/sender/payload 为字符串，ts 为非负有限数
    if (typeof msg.id !== 'string') return false;
    if (typeof msg.sender !== 'string') return false;
    if (typeof msg.payload !== 'string') return false;
    if (typeof msg.ts !== 'number' || !Number.isFinite(msg.ts) || msg.ts < 0) return false;
    return true;
  }

  /**
   * P2-03：sender 签名校验
   *  - 启用了验签能力（_verify 注入）时，远端非本地消息必须带 sig 且验签通过；
   *    否则（未启用 verify）向后兼容旧纯收敛模式不做强制验签。
   * @private
   */
  _validateSignature(msg) {
    // 未启用验签能力：跳过签名校验（向后兼容旧纯收敛模式）
    if (!this._verify) return true;
    // 带验签能力时，任何经 merge() 进入的外部消息都必须带 sig 且验签通过。
    // 本地 send() 产生的消息直接走内部 _merge()，不经过本方法。
    if (typeof msg.sig !== 'string' || msg.sig.length === 0) return false;
    // 用 sender 公钥对规范化消息体验签
    return this._verify(msg.sender, this._canonical(msg), msg.sig);
  }

  /**
   * 规范化消息串（用于签名/验签，字段顺序固定且不含 sig 自身）
   * @private
   */
  _canonical(msg) {
    return `${msg.id}|${msg.sender}|${msg.channelId}|${msg.type}|${msg.payload}|${msg.ts}`;
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
