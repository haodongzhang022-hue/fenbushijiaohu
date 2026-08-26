'use strict';
/**
 * health 模块 —— 节点健康检测（M2a）
 *
 * 对齐 09-审查补充与增强 §2 节点稳定性：用最近 N 次心跳窗口计算可用率
 *   availability = 成功心跳数 / 应有心跳数
 *   isHealthy(availability >= threshold)
 */
class HealthMonitor {
  /**
   * @param {object} [opts]
   * @param {number} [opts.window] 心跳窗口大小 N
   * @param {number} [opts.threshold] 健康阈值（0~1）
   */
  constructor(opts = {}) {
    this.window = opts.window || 10;
    this.threshold = opts.threshold || 0.7;
    this._heartbeats = new Map(); // nodeId -> boolean[]（最近窗口心跳是否成功）
  }

  /**
   * 记录一次心跳结果
   * @param {string} nodeId
   * @param {boolean} ok
   */
  record(nodeId, ok) {
    if (!this._heartbeats.has(nodeId)) this._heartbeats.set(nodeId, []);
    const arr = this._heartbeats.get(nodeId);
    arr.push(ok);
    if (arr.length > this.window) arr.shift(); // 只保留最近窗口
  }

  /**
   * 计算某节点可用率（窗口内成功心跳占比）
   * @param {string} nodeId
   */
  availability(nodeId) {
    const arr = this._heartbeats.get(nodeId) || [];
    if (arr.length === 0) return 0;
    const ok = arr.filter(Boolean).length;
    return ok / arr.length;
  }

  /**
   * 是否健康（可用率 >= 阈值）
   * @param {string} nodeId
   */
  isHealthy(nodeId) {
    return this.availability(nodeId) >= this.threshold;
  }
}

module.exports = { HealthMonitor };
