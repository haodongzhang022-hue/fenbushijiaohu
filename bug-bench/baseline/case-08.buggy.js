'use strict';
/**
 * case-08 · 分布式计算：聚合结果校验（高区分度·回归陷阱用例）
 *
 * 场景：多个 worker 返回部分结果，聚合器累加。但结果有「正数校验」：
 *   任一 worker 返回负值（异常），聚合必须拒绝（不产出结果），
 *   因为负值意味着计算异常/被篡改。
 *
 * BUG（回归陷阱）：主 bug 是「负值未被拒绝」——直接把所有值累加，
 *   负值也计入结果。修复时若把累加逻辑改坏（如只取最后一个、或
 *   一律拒绝），会破坏「多 worker 正常累加」路径。带壳角色修复会
 *   固化断言防回归；无壳直改易引入新回归。
 *
 * 输入：(values = number[])
 * 输出：{ accepted: boolean, sum: number }
 */
function aggregator(values) {
  // BUG: 未校验负值，直接把所有值（含负值）累加
  const sum = values.reduce((a, b) => a + b, 0);
  return { accepted: true, sum };
}

module.exports = aggregator;
