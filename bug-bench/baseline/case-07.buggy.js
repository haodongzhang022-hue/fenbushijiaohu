'use strict';
/**
 * case-07 · 信任策略：信誉分档位判定（高区分度用例）
 *
 * 场景：贡献者根据信誉分 score 获得信任档位，档位决定可分配任务量上限。
 * 正确档位（04 §3.4 + M6 治理）：
 *   score >= 80   → 'trusted'   （上限 100）
 *   50 <= score < 80 → 'regular' （上限 20）
 *   0  <= score < 50 → 'limited' （上限 5）
 *   score < 0     → 'banned'    （上限 0，禁止接任务）
 *
 * BUG（隐蔽点）：档位判断的边界符号写反——把 score >= 80 写成 score > 80，
 *   导致 score=80 落到 regular、上限从 100 骤降到 20；把 score < 0 的
 *   banned 判定缺失，score 为负时也走 limited。严格断言按 04 契约抓边界。
 *
 * 输入：(score)
 * 输出：{ tier: string, cap: number }
 */
function trustTier(score) {
  let tier, cap;
  if (score > 80) { tier = 'trusted'; cap = 100; }        // BUG: 应 >= 80
  else if (score > 50) { tier = 'regular'; cap = 20; }     // BUG: 应 >= 50
  else { tier = 'limited'; cap = 5; }                      // BUG: 缺 banned 分支
  return { tier, cap };
}

module.exports = trustTier;
