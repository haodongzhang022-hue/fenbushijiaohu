'use strict';
/**
 * failover 模块 —— 故障切换（M2a）
 *
 * 对齐 09-审查补充与增强 §2：健康节点承载任务，失联/不健康节点
 * 触发切换，会话迁移到备用中继。
 *
 *   class FailoverManager {
 *     register(nodeId, backupId): void;
 *     switchIfNeeded(nodeId): string|null;  // 不健康则返回备份节点 id
 *   }
 */
class FailoverManager {
  constructor(health) {
    this.health = health;              // HealthMonitor 实例
    this._backup = new Map();          // nodeId -> backupId
  }

  register(nodeId, backupId) {
    this._backup.set(nodeId, backupId);
  }

  /**
   * 判断是否需要故障切换，返回目标备份节点
   * @param {string} nodeId
   */
  switchIfNeeded(nodeId) {
    if (this.health.isHealthy(nodeId)) return null; // 健康，不切换
    return this._backup.get(nodeId) || null;        // 不健康，切到备份
  }
}

module.exports = { FailoverManager };
