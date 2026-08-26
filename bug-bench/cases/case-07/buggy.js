'use strict';
/**
 * case-07 · 信任策略：信誉分档位判定（高区分度用例）
 *
 * 正确档位（04 §3.4 + M6 治理）：
 *   score >= 80   → 'trusted'   （上限 100）
 *   50 <= score < 80 → 'regular' （上限 20）
 *   0  <= score < 50 → 'limited' （上限 5）
 *   score < 0     → 'banned'    （上限 0，禁止接任务）
 *
 * 输入：(score)
 * 输出：{ tier: string, cap: number }
 */
function trustTier(score) {
  let tier, cap;
  if (score >= 80) { tier = 'trusted'; cap = 100; }
  else if (score >= 50) { tier = 'regular'; cap = 20; }
  else if (score >= 0) { tier = 'limited'; cap = 5; }
  else { tier = 'banned'; cap = 0; }
  return { tier, cap };
}

module.exports = trustTier;
