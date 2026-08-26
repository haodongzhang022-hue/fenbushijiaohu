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
 *
 * WP-6 加固（安全审计 2.1 / 2.2）：
 *   2.1 入参符号/数值校验：`penalize/reward` 仅接受非负有限数值，
 *       负值 / NaN / Infinity 一律抛错，杜绝「扣分变加分」绕过刷分。
 *       封禁下界：score < 0（banned）后 reward 不再可加分复活。
 *   2.2 字段隔离：信誉分以私有字段保存，外部不可直接写 `score`；
 *       提供节流（cooldown）与操作溯源（auditLog）能力。
 */

/** 校验非负有限数值 */
function assertNonNegativeNumber(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new TypeError(`${name} 必须是非负有限数值，收到: ${v}`);
  }
  return v;
}

class Reputation {
  /** @type {number} */
  #score;
  /** @type {number} 奖励冷却间隔 ms，0 表示不限制 */
  #cooldownMs;
  /** @type {number} */
  #lastRewardTs = 0;
  /** @type {Array<object>} 操作溯源日志 */
  #audit = [];

  /**
   * @param {number} [initial]
   * @param {object} [opts]
   * @param {number} [opts.cooldownMs] 两次奖励之间最短间隔（节流，防刷）
   */
  constructor(initial = 0, opts = {}) {
    // 初始值允许为负（表示节点已被封禁 banned），但必须是有限数值且封顶 100
    if (typeof initial !== 'number' || !Number.isFinite(initial)) {
      throw new TypeError(`initial 必须是有穷数值，收到: ${initial}`);
    }
    this.#score = Math.min(initial, 100);
    this.#cooldownMs = opts.cooldownMs || 0;
  }

  /** 当前信誉分（只读，外部不可直接写） */
  get score() {
    return this.#score;
  }

  /** 按档位返回 { tier, cap } */
  tier() {
    if (this.#score >= 80) return { tier: 'trusted', cap: 100 };
    if (this.#score >= 50) return { tier: 'regular', cap: 20 };
    if (this.#score >= 0) return { tier: 'limited', cap: 5 };
    return { tier: 'banned', cap: 0 };
  }

  /**
   * 正常行为加分（缓慢，单次上限防止一天刷满）。
   * banned（score<0）状态下不可加分复活。
   * @param {number} points 非负有限数值
   * @param {object} [opts]
   * @param {string} [opts.note] 溯源备注
   * @returns {number} 更新后的信誉分
   */
  reward(points, opts = {}) {
    assertNonNegativeNumber(points, 'points');
    // 2.1 封禁下界：banned 后不可加分复活
    if (this.#score < 0) return this.#score;
    // 2.2 节流：冷却期内忽略本次奖励
    const now = Date.now();
    if (this.#cooldownMs > 0 && now - this.#lastRewardTs < this.#cooldownMs) {
      return this.#score;
    }
    this.#lastRewardTs = now;
    const inc = Math.min(points, 5); // 单次上限 5
    this.#score = Math.min(100, this.#score + inc);
    this.#audit.push({ ts: now, op: 'reward', delta: inc, note: opts.note });
    return this.#score;
  }

  /**
   * 破坏行为扣分（即刻、可到负值 → banned）。
   * @param {number} points 非负有限数值（负数 / NaN / Infinity 抛错）
   * @param {object} [opts]
   * @param {string} [opts.note] 溯源备注
   * @returns {number} 更新后的信誉分
   */
  penalize(points, opts = {}) {
    assertNonNegativeNumber(points, 'points');
    this.#score = this.#score - points;
    this.#audit.push({ ts: Date.now(), op: 'penalize', delta: -points, note: opts.note });
    return this.#score;
  }

  /** 操作溯源日志（只读副本） */
  auditLog() {
    return this.#audit.map((e) => ({ ...e }));
  }
}

module.exports = { Reputation };
