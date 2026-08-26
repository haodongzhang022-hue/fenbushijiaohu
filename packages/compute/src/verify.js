'use strict';
/**
 * verify 模块 —— 结果校验（M3）
 *
 * 对齐 02 §4 verify + 09 §6.4「计算结果多副本交叉校验」：
 *   当收集到足够副本（>= replicas）后，对多副本结果做一致性校验，
 *   多数一致的结果即为可信结果。
 */
class Verify {
  /**
   * @param {object} [opts]
   * @param {number} [opts.minReplicas] 判定所需最少一致副本数
   */
  constructor(opts = {}) {
    this.minReplicas = opts.minReplicas || 2;
  }

  /**
   * 对多副本结果做多数一致校验
   * @param {Array<*>} results 各节点返回的结果
   * @returns {{trusted:boolean, result:*, agreement:number}}
   */
  verify(results) {
    if (!results || results.length === 0) {
      return { trusted: false, result: undefined, agreement: 0 };
    }
    // 统计各结果出现次数
    const count = new Map();
    for (const r of results) {
      const key = JSON.stringify(r);
      count.set(key, (count.get(key) || 0) + 1);
    }
    // 找出现次数最多的结果
    let bestKey = null;
    let bestN = 0;
    for (const [k, n] of count) {
      if (n > bestN) { bestN = n; bestKey = k; }
    }
    const trusted = bestN >= this.minReplicas;
    return {
      trusted,
      result: trusted ? JSON.parse(bestKey) : undefined,
      agreement: bestN,
    };
  }
}

module.exports = { Verify };
