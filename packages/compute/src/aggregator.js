'use strict';
/**
 * aggregator 模块 —— 聚合器（M3）
 *
 * 对齐 02 §4 aggregator + bug-bench case-08 契约：
 *   任一 worker 返回异常（负值等）→ 聚合必须拒绝；
 *   否则累加全部（不丢前序、不破坏正常路径）。
 */
class Aggregator {
  /**
   * @param {object} [opts]
   * @param {function} [opts.validate] 单值校验函数，返回 false 表示异常
   */
  constructor(opts = {}) {
    this.validate = opts.validate || ((v) => typeof v === 'number' && v >= 0);
  }

  /**
   * 聚合一组结果
   * @param {Array<number>} values
   * @returns {{accepted:boolean, sum:number}}
   */
  aggregate(values) {
    // P2-06 null/undefined 防护：非法入参拒绝，不抛未处理 TypeError
    if (!Array.isArray(values)) {
      return { accepted: false, sum: 0 };
    }
    for (const v of values) {
      if (!this.validate(v)) {
        return { accepted: false, sum: 0 };
      }
    }
    const sum = values.reduce((a, b) => a + b, 0);
    return { accepted: true, sum };
  }
}

module.exports = { Aggregator };
