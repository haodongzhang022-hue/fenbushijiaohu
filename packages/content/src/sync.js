'use strict';
/**
 * sync 模块 —— 云端增量同步（M4b-A）
 *
 * 对齐 16-M4bM5M6与传输层设计 §2（CloudSync）：
 *   将本地签名账本（append-only）增量同步到云端副本，支持多端收敛。
 *
 *   设计要点：
 *   - 本地写 → 追加签名账本（序号 + Lamport 时钟）
 *   - pushLocalDelta：将本地新增账本增量推送到云端
 *   - pullSince(cursor)：从指定游标拉取云端增量
 *   - mergeConflict(a, b)：按账本序号 + Lamport 时钟收敛冲突
 *
 *   R-云端一致性 [MEDIUM]：签名账本序号 + Lamport 时钟收敛，保证多端最终一致。
 *
 *   状态机：idle→connecting→syncing→converged→error
 */
const crypto = require('crypto');

class CloudSync {
  /**
   * @param {object} [opts]
   * @param {object} [opts.storage] 本地 Storage 实例（用于本地账本缓存）
   * @param {object} [opts.cloudAdapter] 云端适配器（put/get/delete 语义，缺省为内存模拟）
   */
  constructor(opts = {}) {
    this._storage = opts.storage || null;
    // 云端适配器：默认为内存 Map（可替换为 S3 兼容适配器）
    this._cloud = opts.cloudAdapter || { _map: {} };
    this._state = 'idle';
    // 签名账本：序号自增，entries = [{ seq, clock, hash, data }]
    this._ledger = [];        // 本地全量账本
    this._cursor = 0;         // 已同步到云端的最大序号
    this._clock = 0;          // Lamport 时钟
    this._error = null;
  }

  /**
   * 向本地签名账本追加一条记录（写路径）。
   * 追加后序号 +1，Lamport 时钟 +1。
   * @param {string} data 账本内容（评论/元数据等）
   * @param {object} [meta] 附加元数据
   * @returns {{seq:number, clock:number, hash:string, data:string, meta:object}}
   */
  append(data, meta = {}) {
    if (typeof data !== 'string' || data.length === 0) {
      throw new TypeError('账本条目 data 必须为非空字符串');
    }
    const seq = this._ledger.length + 1;
    this._clock += 1;
    const entry = {
      seq,
      clock: this._clock,
      hash: this._hash(`${seq}:${this._clock}:${data}`),
      data,
      meta,
    };
    this._ledger.push(entry);
    if (this._storage) {
      this._storage.put(`ledger:${seq}`, entry);
    }
    return entry;
  }

  /**
   * 将本地新增账本增量推送到云端（pushLocalDelta）。
   * @returns {{pushed:number, cursor:number}} 推送条数与新游标
   */
  async pushLocalDelta() {
    this._state = 'connecting';
    try {
      const delta = this._ledger.slice(this._cursor);
      if (delta.length === 0) {
        this._state = 'converged';
        return { pushed: 0, cursor: this._cursor };
      }
      this._state = 'syncing';
      // 逐条推送到云端（键 = seq）
      for (const entry of delta) {
        await this._cloudPut(entry.seq, entry);
      }
      this._cursor = this._ledger.length;
      this._state = 'converged';
      return { pushed: delta.length, cursor: this._cursor };
    } catch (err) {
      this._state = 'error';
      this._error = err;
      throw err;
    }
  }

  /**
   * 从指定游标拉取云端增量。
   * @param {number} [cursor] 起始游标（默认当前已同步游标）
   * @returns {{entries:Array, cursor:number}} 拉取的增量与最新游标
   */
  async pullSince(cursor = this._cursor) {
    this._state = 'connecting';
    try {
      // 获取云端所有 key
      const keys = await this._cloudKeys();
      const numericKeys = keys
        .filter((k) => {
          const n = Number(k);
          return Number.isFinite(n) && !Number.isNaN(n) && n > cursor;
        })
        .map(Number)
        .sort((a, b) => a - b);
      const entries = [];
      for (const k of numericKeys) {
        const entry = await this._cloudGet(k);
        if (entry) entries.push(entry);
      }
      this._state = 'converged';
      const latest = entries.length > 0 ? Math.max(...entries.map((e) => e.seq)) : cursor;
      return { entries, cursor: latest };
    } catch (err) {
      this._state = 'error';
      this._error = err;
      throw err;
    }
  }

  /**
   * 获取当前同步游标。
   * @returns {number}
   */
  getCursor() {
    return this._cursor;
  }

  /**
   * 冲突合并：两个冲突条目按「账本序号优先 + Lamport 时钟 + 哈希确定序」收敛。
   * @param {object} a 条目 A
   * @param {object} b 条目 B
   * @returns {object} 选中的条目（确定性收敛）
   */
  mergeConflict(a, b) {
    if (!a || !b) return a || b;
    if (a.seq !== b.seq) return a.seq < b.seq ? a : b; // 序号小者优先（更早写入）
    if (a.clock !== b.clock) return a.clock > b.clock ? a : b; // 时钟大者后写胜出
    // 同序号同时钟：按哈希字典序确定性收敛
    return a.hash < b.hash ? a : b;
  }

  /**
   * 合并云端拉取到的增量到本地账本（收敛）。
   * 用 mergeConflict 解决与本地冲突的条目。
   * @param {Array} remoteEntries 云端增量条目
   * @returns {number} 合并后本地账本条目数
   */
  merge(remoteEntries) {
    if (!Array.isArray(remoteEntries)) return this._ledger.length;
    for (const remote of remoteEntries) {
      if (!remote || typeof remote.seq !== 'number') continue;
      const localIdx = this._ledger.findIndex((e) => e.seq === remote.seq);
      if (localIdx === -1) {
        this._ledger.push(remote);
      } else {
        // 冲突：按确定性规则收敛
        const winner = this.mergeConflict(this._ledger[localIdx], remote);
        this._ledger[localIdx] = winner;
      }
    }
    // 按 seq 排序保证有序
    this._ledger.sort((x, y) => x.seq - y.seq);
    return this._ledger.length;
  }

  /** 获取当前状态 */
  getState() {
    return this._state;
  }

  /** 获取当前 Lamport 时钟 */
  getClock() {
    return this._clock;
  }

  /** 获取账本长度 */
  get ledgerSize() {
    return this._ledger.length;
  }

  /** 获取完整账本（只读视图） */
  getLedger() {
    return this._ledger.map((e) => ({ ...e }));
  }

  /** 账本条目指纹（SHA-256） */
  _hash(str) {
    return crypto.createHash('sha256').update(String(str)).digest('hex');
  }

  /** 云端写入 */
  async _cloudPut(key, value) {
    if (this._cloud && typeof this._cloud.put === 'function') {
      return this._cloud.put(key, value);
    }
    if (!this._cloud._map) this._cloud._map = {};
    this._cloud._map[String(key)] = value;
    return true;
  }

  /** 云端读取 */
  async _cloudGet(key) {
    if (this._cloud && typeof this._cloud.get === 'function') {
      return this._cloud.get(key);
    }
    if (!this._cloud._map) return null;
    return this._cloud._map[String(key)] || null;
  }

  /** 枚举云端所有 key */
  async _cloudKeys() {
    if (this._cloud && typeof this._cloud.keys === 'function') {
      return this._cloud.keys();
    }
    if (this._cloud && this._cloud._map) {
      return Object.keys(this._cloud._map);
    }
    return [];
  }
}

module.exports = { CloudSync };
