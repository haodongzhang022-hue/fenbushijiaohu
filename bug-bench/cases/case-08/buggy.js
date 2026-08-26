'use strict';
/**
 * case-08 · 分布式计算：聚合结果校验（高区分度·回归陷阱用例）
 *
 * 正确行为：任一 worker 返回负值（异常），聚合必须拒绝；
 *   否则累加全部（不丢前序、不破坏正常路径）。
 *
 * 输入：(values = number[])
 * 输出：{ accepted: boolean, sum: number }
 */
function aggregator(values) {
  for (const v of values) {
    if (v < 0) return { accepted: false, sum: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return { accepted: true, sum };
}

module.exports = aggregator;
