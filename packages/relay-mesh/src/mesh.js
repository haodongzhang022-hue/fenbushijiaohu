'use strict';
/**
 * mesh 模块 —— 中继网格（M2a）
 *
 * 对齐 09-审查补充与增强 §3.1：任何空闲算力/带宽富余节点可声明为志愿者中继，
 * 中继只转发不落盘。提供 findRelay 为某目标选择可用中继。
 */
class RelayMesh {
  constructor() {
    this._relays = new Map(); // relayId -> { id, capacity, healthy }
  }

  /** 志愿者节点声明成为中继 */
  offer(relayId, capacity = 1) {
    this._relays.set(relayId, { id: relayId, capacity, healthy: true });
    return this._relays.get(relayId);
  }

  /** 中继失联/下线 */
  withdraw(relayId) {
    this._relays.delete(relayId);
  }

  /** 标记中继健康状态 */
  setHealth(relayId, healthy) {
    const r = this._relays.get(relayId);
    if (r) r.healthy = healthy;
  }

  /**
   * 为对端选择一条中继（仅健康且有余量的志愿者）
   * @param {string} targetId
   */
  findRelay(targetId) {
    const candidates = [...this._relays.values()].filter(
      (r) => r.healthy && r.capacity > 0
    );
    if (candidates.length === 0) return null;
    // 简单策略：选容量最大者（模拟负载均衡）
    candidates.sort((a, b) => b.capacity - a.capacity);
    const chosen = candidates[0];
    chosen.capacity -= 1; // 占用一份容量
    return { id: chosen.id, addr: `relay://${chosen.id}`, cost: 1 };
  }

  /** 中继节点数量 */
  get size() {
    return this._relays.size;
  }
}

module.exports = { RelayMesh };
