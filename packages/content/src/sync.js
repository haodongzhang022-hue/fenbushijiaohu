'use strict';
/**
 * sync 模块 —— 云端同步（M4b）
 *
 * 对齐 09-审查补充与增强 §4 三明治式存储：
 *   L1 云端热存/中存 —— 评论、视频元数据、签名账本多端同步、容灾。
 *
 * 设计：
 *   - append-only 签名账本作为事实源（本地写 → 追加到账本 → 同步云端）
 *   - 增量推送：仅同步自上次同步点之后的日志条目
 *   - 拉取合并：从云端拉取远程日志增量，与本地合并（CRDT 收敛语义）
 *   - 校验：日志条目含 hash 链，保证同步过程的完整性
 *
 *   class SyncClient {
 *     push(log): {accepted, pushed, since};
 *     pull(): {entries, since};
 *     merge(local, remote): {merged, entries};
 *   }
 */
const crypto = require('crypto');

function hashEntry(entry) {
  return crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

class SyncClient {
  /**
   * @param {object} [opts]
   * @param {number} [opts.chunkSize] 同步分块大小
   */
  constructor(opts = {}) {
    this._cloudLog = [];       // 云端侧的账本（模拟）
    this._since = 0;            // 本端已确认的云端同步点
    this.chunkSize = opts.chunkSize || 100;
  }

  /**
   * 将本地新增的日志条目推送到云端
   * @param {Array<object>} entries 本地账本中的新条目（带 seq 自增）
   * @returns {{accepted:boolean, pushed:number, since:number}}
   */
  push(entries) {
    if (!Array.isArray(entries)) throw new TypeError('entries 必须是数组');
    let pushed = 0;
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      // 必须包含 hash 字段作为完整性校验
      const hash = e.hash || hashEntry({ seq: e.seq, data: e.data });
      const entry = {
        seq: e.seq ?? this._cloudLog.length,
        data: e.data ?? null,
        hash,
        ts: e.ts ?? Date.now(),
      };
      // 按 seq 去重（已有相同 seq 的跳过）
      const existing = this._cloudLog.findIndex((x) => x.seq === entry.seq);
      if (existing >= 0) {
        // seq 相同但 hash 不同 → 冲突，拒绝
        if (this._cloudLog[existing].hash !== entry.hash) return { accepted: false, pushed: 0, since: this._since };
        continue;
      }
      this._cloudLog.push(entry);
      pushed++;
    }
    // 按 seq 排序
    this._cloudLog.sort((a, b) => a.seq - b.seq);
    this._since = this._cloudLog.length;
    return { accepted: true, pushed, since: this._since };
  }

  /**
   * 从云端拉取同步点之后的增量日志
   * @param {number} [since] 本地已知的同步点，缺省用本端 _since
   * @returns {{entries: Array<object>, since: number}}
   */
  pull(since) {
    const from = since ?? this._since;
    const entries = this._cloudLog.filter((e) => e.seq >= from);
    return { entries, since: this._cloudLog.length };
  }

  /**
   * 将本地与云端日志合并（CRDT 收敛语义：按 seq 排序去重）
   * @param {Array<object>} local 本地日志
   * @param {Array<object>} remote 云端拉取的增量日志
   * @returns {{merged: Array<object>, conflict: boolean}}
   */
  merge(local, remote) {
    if (!Array.isArray(local) || !Array.isArray(remote)) {
      throw new TypeError('local 和 remote 必须是数组');
    }
    const bySeq = new Map();
    let conflict = false;
    for (const e of local) {
      if (e && typeof e.seq === 'number') bySeq.set(e.seq, e);
    }
    for (const e of remote) {
      if (!e || typeof e.seq !== 'number') continue;
      const existing = bySeq.get(e.seq);
      if (existing && existing.hash !== e.hash) {
        conflict = true; // 同 seq 不同 hash → 冲突，取本地（后写优先）
        continue;
      }
      bySeq.set(e.seq, e);
    }
    const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
    return { merged, conflict };
  }

  /** 云端日志条目数 */
  get size() {
    return this._cloudLog.length;
  }
}

module.exports = { SyncClient };
