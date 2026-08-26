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
   */
  submit(spec) {
    const id = crypto.createHash('sha256').update(spec.input).digest('hex').slice(0, 16);
    const task = {
      id,
      type: spec.type,
      input: spec.input,
      replicas: spec.replicas || 1,
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
   */
  collect(taskId, value) {
    if (!this._results.has(taskId)) throw new Error('任务不存在');
    this._results.get(taskId).push(value);
    return this._results.get(taskId).length;
  }

  /** 已收集的结果副本数 */
  resultCount(taskId) {
    return (this._results.get(taskId) || []).length;
  }
}

module.exports = { Compute };
