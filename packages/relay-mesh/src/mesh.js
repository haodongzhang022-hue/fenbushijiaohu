'use strict';
/**
 * mesh 模块 —— 中继网格（M2a）
 *
 * 对齐 09-审查补充与增强 §3.1：任何空闲算力/带宽富余节点可声明为志愿者中继，
 * 中继只转发不落盘。提供 findRelay 为某目标选择可用中继。
 *
 * WP-6 加固（安全审计 4.1）：
 *   - 显式 `release(leaseId)`：释放中继占用的容量，容量可恢复。
 *   - TTL 租约：`findRelay` 返回 `leaseId`，每条租约带过期时间；
 *     TTL 到期或下次查询时自动回收，杜绝容量「只占不还」导致全网耗尽（DoS）。
 */
const crypto = require('crypto');

class RelayMesh {
  /**
   * @param {object} [opts]
   * @param {number} [opts.ttlMs] 租约有效期 ms；0 表示不自动过期（仅显式 release）
   */
  constructor(opts = {}) {
    this._relays = new Map(); // relayId -> { id, capacity, healthy }
    this._leases = new Map(); // leaseId -> { relayId, expiresAt }
    this.ttlMs = opts.ttlMs || 0;
  }

  /** 志愿者节点声明成为中继 */
  offer(relayId, capacity = 1) {
    this._relays.set(relayId, { id: relayId, capacity, healthy: true });
    return this._relays.get(relayId);
  }

  /** 中继失联/下线 */
  withdraw(relayId) {
    // 释放该中继名下全部未过期租约
    for (const [leaseId, lease] of this._leases) {
      if (lease.relayId === relayId) this._leases.delete(leaseId);
    }
    this._relays.delete(relayId);
  }

  /** 标记中继健康状态 */
  setHealth(relayId, healthy) {
    const r = this._relays.get(relayId);
    if (r) r.healthy = healthy;
  }

  /** 回收已过期的租约（TTL 自动释放容量） */
  _reapExpiredLeases() {
    if (this.ttlMs <= 0) return;
    const now = Date.now();
    for (const [leaseId, lease] of this._leases) {
      if (lease.expiresAt > 0 && lease.expiresAt <= now) {
        this._leases.delete(leaseId);
        const r = this._relays.get(lease.relayId);
        if (r) r.capacity += 1; // 容量恢复
      }
    }
  }

  /**
   * 为对端选择一条中继（仅健康且有余量的志愿者）
   * @param {string} targetId
   * @returns {{id:string, addr:string, cost:number, leaseId:string}|null}
   */
  findRelay(targetId) {
    this._reapExpiredLeases(); // 先回收过期租约
    const candidates = [...this._relays.values()].filter(
      (r) => r.healthy && r.capacity > 0
    );
    if (candidates.length === 0) return null;
    // 简单策略：选容量最大者（模拟负载均衡）
    candidates.sort((a, b) => b.capacity - a.capacity);
    const chosen = candidates[0];
    chosen.capacity -= 1; // 占用一份容量
    const leaseId = `${chosen.id}:${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = this.ttlMs > 0 ? Date.now() + this.ttlMs : 0;
    this._leases.set(leaseId, { relayId: chosen.id, expiresAt });
    return { id: chosen.id, addr: `relay://${chosen.id}`, cost: 1, leaseId };
  }

  /**
   * 释放一条中继租约，容量恢复。
   * @param {string} leaseId findRelay 返回的租约 id
   * @returns {boolean} 是否成功释放
   */
  release(leaseId) {
    const lease = this._leases.get(leaseId);
    if (!lease) return false;
    this._leases.delete(leaseId);
    const r = this._relays.get(lease.relayId);
    if (r) r.capacity += 1; // 容量恢复
    return true;
  }

  /** 当前活跃租约数 */
  get leaseCount() {
    return this._leases.size;
  }

  /** 中继节点数量 */
  get size() {
    return this._relays.size;
  }
}

module.exports = { RelayMesh };
