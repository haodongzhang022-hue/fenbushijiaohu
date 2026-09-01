'use strict';
/**
 * governance 模块 —— 社区治理（M6）
 *
 * 对齐 16 号文档 §4.2 治理：
 *   模块：governance/moderation.js + governance/verdict.js + content/report.js
 *   职责：信号聚合 + 分级处置 + 透明留痕，筛正常用户、识别恶性个体
 *   输入：report(evidence) / moderate(action)
 *   输出：Verdict(level) / 处置动作（限流/封禁/恢复）
 *   依赖：reputation、content/report
 *   风险：[HIGH] 误伤正常用户、举报武器化
 *   状态机：pending→reviewing→verdict→enforced
 *
 * 实现原则（对齐 16 号文档风险规避）：
 *   - 先限流后封禁：处置逐级升级（警告→限流→封禁）
 *   - 可申诉可复核：每项裁决保留 reviewable 标记
 *   - 举报者权重：低信誉新用户举报权重低，防武器化
 *   - 冷启动保护：新账号（信誉分在冷启动区间）不被轻易处置
 *   - 透明留痕：所有举报/处置/复核记录可审计
 */

// 处置级别（由轻到重）
const VERDICT_LEVELS = {
  OK: 'ok',             // 无违规
  WARN: 'warn',         // 警告（首次轻微违规）
  LIMITED: 'limited',   // 限流（中等违规）
  BANNED: 'banned',     // 封禁（严重/重复违规）
};

class Governance {
  /**
   * @param {object} opts
   * @param {Function} [opts.reputationOf] 获取用户信誉分的函数
   * @param {number} [opts.coldStartRep] 冷启动保护阈值（默认 20）
   * @param {number} [opts.reportCooldownMs] 举报冷却间隔 ms
   */
  constructor(opts = {}) {
    this._reports = new Map();   // accountId -> Array<report>
    this._verdicts = new Map();  // accountId -> { level, ts, reason, reviewable }
    this._moderations = new Map(); // accountId -> Array<moderation>
    this._reputationOf = opts.reputationOf || (() => 50); // 默认中等信誉
    this.coldStartRep = opts.coldStartRep || 20;
    this._reportCooldownMs = opts.reportCooldownMs || 60000;
    this._lastReportTs = new Map(); // reporterId -> ts
    this._reportCount = new Map();  // reporterId -> 次数（防刷）
    this._maxReportsPerHour = 10;   // 每小时内最多举报次数
  }

  /**
   * 提交举报（计入信誉权重，防武器化）
   * @param {string} reporterId 举报者
   * @param {string} targetId    被举报者
   * @param {object} evidence    证据（含描述/关联内容）
   * @returns {{accepted:boolean, weight:number, reportId:string}}
   */
  report(reporterId, targetId, evidence = {}) {
    // 冷却检查
    const now = Date.now();
    const last = this._lastReportTs.get(reporterId) || 0;
    if (now - last < this._reportCooldownMs) {
      return { accepted: false, weight: 0, reportId: null, reason: '举报冷却中' };
    }
    // 频率限制
    const count = this._reportCount.get(reporterId) || 0;
    if (count >= this._maxReportsPerHour) {
      return { accepted: false, weight: 0, reportId: null, reason: '举报频率超限' };
    }
    // 举报者权重：按信誉分映射
    const reporterRep = this._reputationOf(reporterId);
    // 权重 = 信誉分归一化（0~1），低信誉权重低
    const weight = reporterRep >= 80 ? 1.0 : reporterRep >= 50 ? 0.7 : reporterRep >= 20 ? 0.3 : 0.05;

    const reportId = `rpt-${now}-${Math.random().toString(16).slice(2, 10)}`;
    const report = {
      id: reportId,
      reporterId,
      targetId,
      evidence,
      weight,
      ts: now,
      status: 'pending',
    };
    if (!this._reports.has(targetId)) this._reports.set(targetId, []);
    this._reports.get(targetId).push(report);

    // 更新举报计数与冷却
    this._lastReportTs.set(reporterId, now);
    this._reportCount.set(reporterId, count + 1);

    return { accepted: true, weight, reportId };
  }

  /**
   * 分级处置
   * @param {string} targetId 目标用户
   * @param {'warn'|'limited'|'banned'} action 处置动作
   * @param {object} [opts]
   * @param {string} [opts.reason] 处置原因
   * @param {boolean} [opts.reviewable] 是否可申诉复核（默认 true）
   * @returns {{level:string, ts:number, reviewable:boolean}}
   */
  moderate(action, targetId, opts = {}) {
    if (![VERDICT_LEVELS.WARN, VERDICT_LEVELS.LIMITED, VERDICT_LEVELS.BANNED].includes(action)) {
      throw new Error(`非法处置级别: ${action}`);
    }
    // 冷启动保护：低信誉新账号仅警告/限流，不直接封禁
    const rep = this._reputationOf(targetId);
    if (action === VERDICT_LEVELS.BANNED && rep < this.coldStartRep) {
      action = VERDICT_LEVELS.LIMITED; // 降级为限流
    }
    const verdict = {
      level: action,
      ts: Date.now(),
      reason: opts.reason || '',
      reviewable: opts.reviewable !== false, // 默认可申诉
      reviewer: opts.reviewer || 'system',
    };
    if (!this._verdicts.has(targetId)) this._verdicts.set(targetId, []);
    this._verdicts.get(targetId).push(verdict);

    const moderation = {
      targetId,
      level: action,
      ts: Date.now(),
      reason: opts.reason || '',
      reviewable: verdict.reviewable,
    };
    if (!this._moderations.has(targetId)) this._moderations.set(targetId, []);
    this._moderations.get(targetId).push(moderation);

    // 标记对应举报为已处置
    if (this._reports.has(targetId)) {
      for (const r of this._reports.get(targetId)) {
        if (r.status === 'pending') r.status = 'resolved';
      }
    }

    return verdict;
  }

  /**
   * 裁决（综合信誉 + 举报权重判断）
   * @param {string} targetId
   * @returns {{level:string, score:number, reportCount:number}}
   */
  verdict(targetId) {
    const reports = this._reports.get(targetId) || [];
    const rep = this._reputationOf(targetId);
    const reportCount = reports.length;
    const totalWeight = reports.reduce((s, r) => s + r.weight, 0);

    let level = VERDICT_LEVELS.OK;
    // 判定逻辑：权重和 + 信誉分综合
    if (reportCount === 0) {
      level = VERDICT_LEVELS.OK;
    } else if (totalWeight >= 3.0 || rep < 0) {
      level = VERDICT_LEVELS.BANNED;
    } else if (totalWeight >= 1.5 || rep < 20) {
      level = VERDICT_LEVELS.LIMITED;
    } else if (totalWeight >= 0.5) {
      level = VERDICT_LEVELS.WARN;
    }

    return { level, score: rep, reportCount };
  }

  /**
   * 举报者权重（防武器化）
   * @param {string} reporterId
   */
  weightOf(reporterId) {
    const rep = this._reputationOf(reporterId);
    return rep >= 80 ? 1.0 : rep >= 50 ? 0.7 : rep >= 20 ? 0.3 : 0.05;
  }

  /**
   * 申诉/复核（解除或降级处置）
   * @param {string} targetId
   * @param {string} appealReason
   * @returns {{level:string, appealed:boolean}}
   */
  appeal(targetId, appealReason) {
    const verdicts = this._verdicts.get(targetId) || [];
    if (verdicts.length === 0) return { level: VERDICT_LEVELS.OK, appealed: false };

    // 从最新的裁决往前找，可申诉则降级
    for (let i = verdicts.length - 1; i >= 0; i--) {
      const v = verdicts[i];
      if (v.reviewable) {
        // 降级：banned→limited, limited→warn, warn→ok
        const demotion = {
          [VERDICT_LEVELS.BANNED]: VERDICT_LEVELS.LIMITED,
          [VERDICT_LEVELS.LIMITED]: VERDICT_LEVELS.WARN,
          [VERDICT_LEVELS.WARN]: VERDICT_LEVELS.OK,
        };
        const newLevel = demotion[v.level] || VERDICT_LEVELS.OK;
        v.level = newLevel;
        v.reviewed = true;
        v.appealReason = appealReason;
        return { level: newLevel, appealed: true };
      }
    }
    return { level: verdicts[verdicts.length - 1].level, appealed: false };
  }

  /**
   * 审计记录（全部举报/处置/复核）
   */
  auditLog() {
    const log = [];
    for (const [accountId, reports] of this._reports) {
      for (const r of reports) {
        log.push({ type: 'report', accountId, report: r });
      }
    }
    for (const [accountId, verdicts] of this._verdicts) {
      for (const v of verdicts) {
        log.push({ type: 'verdict', accountId, verdict: v });
      }
    }
    return log;
  }

  /** 重置举报频率计数（每小时） */
  resetReportCount() {
    this._reportCount.clear();
  }
}

module.exports = { Governance, VERDICT_LEVELS };
