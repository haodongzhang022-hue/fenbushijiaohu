'use strict';
/**
 * reputation 模块 —— 信誉分（M3 协同 / M6 前置）
 *
 * 对齐 09 §6 信誉分档位（bug-bench case-07 契约）：
 *   score >= 80          → 'trusted'  cap=100
 *   50 <= score < 80     → 'regular'  cap=20
 *   0  <= score < 50     → 'limited'  cap=5
 *   score < 0            → 'banned'   cap=0（禁止接任务）
 * 单向棘轮：正常行为缓慢加分，破坏行为扣分。
 */
class Reputation {
  /**
   * @param {number} [initial]
   */
  constructor(initial = 0) {
    this.score = initial;
  }

  /** 按档位返回 { tier, cap } */
  tier() {
    if (this.score >= 80) return { tier: 'trusted', cap: 100 };
    if (this.score >= 50) return { tier: 'regular', cap: 20 };
    if (this.score >= 0) return { tier: 'limited', cap: 5 };
    return { tier: 'banned', cap: 0 };
  }

  /** 正常行为加分（缓慢，单次上限防止一天刷满） */
  reward(points) {
    this.score = Math.min(100, this.score + Math.min(points, 5));
    return this.score;
  }

  /** 破坏行为扣分（即刻、可到负值 → banned） */
  penalize(points) {
    this.score = this.score - points;
    return this.score;
  }
}

module.exports = { Reputation };
