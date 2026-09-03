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
 *     sig?: string;        // （安全模式）sender 对该消息规范的签名
 *   }
 *
 * 收敛规则（LWW-Element-Set 语义）：
 *   - 每条消息以 (channelId, id) 为唯一键；
 *   - 同键冲突时取 ts 较大者胜出（Lamport 时钟 + 节点序号 tie-break）；
 *   - 追加/合并对方消息后，本地视图与远端收敛到同一消息序列。
 *
 * 安全加固（P2-03 / P2-05）：
 *   - 构造器可传入可选的 `identity`（含 .sign/.verify/.publicKey），进入"签名模式"；
 *   - 签名模式下 send() 自动为消息附带 sender 签名，merge() 校验 sender 签名，
 *     未签名/伪造身份的消息将被拒绝（返回 false）；
 *   - 未传 identity 时保持 M1 MVP 旧语义（不强制签名），以兼容无签名凭据的历史测试。
 */
const crypto = require('crypto');

// 消息类型白名单
const MSG_TYPES = ['text', 'media', 'game-cmd', 'task'];

// merge 必需的不可变字段（P2-05 字段完整性校验）
const REQUIRED_FIELDS = ['id', 'sender', 'channelId', 'type', 'payload', 'ts'];

class Session {
  /**
   * @param {string} localPubKey 本地身份公钥
   * @param {string} channelId   会话频道
   * @param {{identity?: object}} [opts] 可选：identity（含 sign/verify/publicKey）
   *        传入后进入签名模式（P2-03）。
   */
  constructor(localPubKey, channelId, opts = {}) {
    this.localPubKey = localPubKey;
    this.channelId = channelId;
    this._identity = opts.identity || null;  // 签名模式开关
    this._clock = 0;                         // Lamport 逻辑时钟
    this._messages = new Map();              // key = `${channelId}:${id}`
  }

  /** 是否处于签名模式（P2-03） */
  get signed() {
    return this._identity !== null;
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
    if (typeof payload !== 'string') {
      throw new TypeError(`send() 入参 payload 必须为字符串`);
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
    // 签名模式下附带 sender 签名
    if (this._identity) {
      msg.sig = this._identity.sign(this._canonical(msg));
    }
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
    // P2-05：字段完整性校验 —— 必需字段必须齐全
    if (!this._hasRequiredFields(msg)) return false;
    // P2-03：签名模式下校验 sender 签名，未签名/伪造身份被拒
    if (this._identity && !this._verifySender(msg)) return false;
    // 推进逻辑时钟
    this._clock = Math.max(this._clock, msg.ts) + 1;
    return this._merge(msg);
  }

  /**
   * P2-05：校验消息必需字段齐全且类型正确
   * @private
   */
  _hasRequiredFields(msg) {
    for (const f of REQUIRED_FIELDS) {
      if (!(f in msg) || msg[f] === undefined || msg[f] === null) return false;
    }
    if (typeof msg.id !== 'string') return false;
    if (typeof msg.sender !== 'string') return false;
    if (typeof msg.payload !== 'string') return false;
    if (typeof msg.ts !== 'number') return false;
    return true;
  }

  /**
   * P2-03：校验消息 sender 签名。消息须带 sig 且由 msg.sender 对规范内容验签通过。
   * 对外暴露，供上层在落地前独立复核；merge() 内部亦调用本校验。
   * @param {object} msg 待校验消息（须含 id/sender/channelId/type/payload/ts/sig）
   * @returns {boolean} 验签是否通过
   */
  verifySender(msg) {
    if (!this._identity) return true; // 非签名模式（M1 兼容）视为通过
    if (!msg || typeof msg.sig !== 'string' || msg.sig.length === 0) return false;
    return this._identity.verify(msg.sender, this._canonical(msg), msg.sig);
  }

  /**
   * P2-03：merge 内部 sender 签名校验
   * @private
   */
  _verifySender(msg) {
    return this.verifySender(msg);
  }

  /**
   * 计算消息签名/校验用的规范序列化串（覆盖全部不可变内容字段）
   * @private
   */
  _canonical(msg) {
    return JSON.stringify({
      id: msg.id,
      sender: msg.sender,
      channelId: msg.channelId,
      type: msg.type,
      payload: msg.payload,
      ts: msg.ts,
    });
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
