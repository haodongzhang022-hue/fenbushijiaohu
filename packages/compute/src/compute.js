'use strict';
/**
 * compute 模块 —— 计算任务（M3）
 *
 * 对齐 02 §4 计算层 + 04 §3.5 计算任务：
 *   interface Task {
 *     id: string;
 *     type: string;       // 注册的计算类型
 *     input: string;
 *     replicas: number;   // 副本数（校验用）
 *   }
 *   interface Compute {
 *     submit(task): Task;                 // 登记任务
 *     split(task, parts): string[];       // 任务切分为子任务
 *     collect(result): void;              // 收集单节点结果
 *   }
 *
 * WP-6 加固（安全审计 1.3）：
 *   - 任务 id 熵：改用完整 SHA-256（256-bit）+ 随机盐，消除 64-bit 截断低熵可预测性。
 *   - submitter 绑定：登记任务时记录提交者身份，供校验溯源 / 防覆盖他人任务。
 *   - 冲突检测：id 已存在时加盐重试，避免碰撞覆盖。
 */
const crypto = require('crypto');

class Compute {
  constructor() {
    this._tasks = new Map();   // id -> task
    this._results = new Map(); // id -> array<result>
  }

  /**
   * 提交一个计算任务
   * @param {{type:string, input:string, replicas?:number}} spec
   * @param {string} [submitterId] 提交者身份（绑定溯源）
   */
  submit(spec, submitterId = 'anonymous') {
    let id;
    // 冲突检测：生成唯一 id（完整 SHA-256 + 随机盐），碰撞则加盐重试
    for (let attempt = 0; attempt < 8; attempt++) {
      const salt = `${Date.now()}:${crypto.randomBytes(8).toString('hex')}:${attempt}`;
      id = crypto.createHash('sha256')
        .update(`${spec.type}:${spec.input}:${salt}`)
        .digest('hex');
      if (!this._tasks.has(id)) break;
    }
    if (this._tasks.has(id)) {
      throw new Error('无法生成唯一任务 id，请重试');
    }
    const task = {
      id,
      type: spec.type,
      input: spec.input,
      replicas: spec.replicas || 1,
      submitter: submitterId, // 1.3 提交者绑定
    };
    this._tasks.set(id, task);
    this._results.set(id, []);
    return task;
  }

  /**
   * 将任务切分为若干子任务（按 replicas 数量）
   * @param {string} taskId
   * @param {number} parts
   */
  split(taskId, parts) {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error('任务不存在');
    const chunks = [];
    const step = Math.max(1, Math.ceil(task.input.length / parts));
    for (let i = 0; i < task.input.length; i += step) {
      chunks.push(task.input.slice(i, i + step));
    }
    return chunks;
  }

  /**
   * 收集一个节点返回的结果
   * @param {string} taskId
   * @param {*} value
   * @param {string} [nodeId] 结果来源节点（供校验溯源）
   */
  collect(taskId, value, nodeId) {
    if (!this._results.has(taskId)) throw new Error('任务不存在');
    this._results.get(taskId).push({ value, nodeId: nodeId || null });
    return this._results.get(taskId).length;
  }

  /** 已收集的结果副本数 */
  resultCount(taskId) {
    return (this._results.get(taskId) || []).length;
  }
}

module.exports = { Compute };
