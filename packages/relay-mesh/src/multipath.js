'use strict';
/**
 * multipath 模块 —— 多路径传输（M2a）
 *
 * 对齐 09-审查补充与增强 §3.2：同一内容从多条路径同时拉取（直连 + 1~2 个中继），
 * 取先到者/按分片合并。这里以「分片并行拉取 + 乱序重组」为最小可测模型。
 */
class Multipath {
  constructor() {
    this._fragments = new Map(); // seq -> data
  }

  /**
   * 分片拉取：各路径返回不同分片，按 seq 重组
   * @param {Array<{seq:number,data:string}>} fetched
   */
  ingest(fetched) {
    for (const f of fetched) {
      this._fragments.set(f.seq, f.data);
    }
    return this._fragments.size;
  }

  /**
   * 判断是否已收齐 [0, total) 全部分片
   * @param {number} total
   */
  isComplete(total) {
    for (let i = 0; i < total; i++) {
      if (!this._fragments.has(i)) return false;
    }
    return true;
  }

  /**
   * 按 seq 升序重组完整内容
   * @param {number} total
   */
  reassemble(total) {
    if (!this.isComplete(total)) throw new Error('分片未收齐，无法重组');
    return Array.from({ length: total }, (_, i) => this._fragments.get(i)).join('');
  }
}

module.exports = { Multipath };
