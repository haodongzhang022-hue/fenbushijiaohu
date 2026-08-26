'use strict';
/**
 * verify 模块 —— 结果校验（M3）
 *
 * 对齐 02 §4 verify + 09 §6.4「计算结果多副本交叉校验」：
 *   当收集到足够副本（>= replicas）后，对多副本结果做一致性校验，
 *   多数一致的结果即为可信结果。
 *
 * WP-6 加固（安全审计 1.1 / 1.2 / 1.4）：
 *   1.1 节点身份绑定：可绑定 nodeId，同一节点重复提交同结果仅计一次，防 Sybil 伪造多数。
 *   1.2 键序规范化：结果 key 统一经 `canonicalStringify` 递归排序对象键，
 *       `{a:1,b:2}` 与 `{b:2,a:1}` 判为等价（键序无关判等）。
 *   1.4 JSON 净化：`parseSafely` 仅接受合法的 JSON 标量/数组/普通对象，
 *       拒绝函数、symbol、__proto__ 污染等异常值。
 */

/**
 * 深度规范化序列化：递归排序对象键，使键序无关的结果判等。
 * @param {*} value
 * @returns {string}
 */
function canonicalStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => {
      // 显式编码键名，避免 { 'a,b': 1 } 与 { a: ['b',1] } 歧义
      return JSON.stringify(k) + ':' + canonicalStringify(value[k]);
    });
    return '{' + parts.join(',') + '}';
  }
  // 原始类型：数字/字符串/布尔 直接序列化
  return JSON.stringify(value);
}

/**
 * JSON 净化解析：仅接受合法 JSON 标量 / 数组 / 普通对象。
 * 拒绝函数、symbol、undefined、BigInt 及原型链污染键（__proto__/constructor）。
 * @param {*} value 待净化值
 * @returns {boolean} 是否可通过净化
 */
function isSafeJSON(value) {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'number' || t === 'string' || t === 'boolean') return true;
  if (Array.isArray(value)) {
    return value.every(isSafeJSON);
  }
  if (t === 'object') {
    for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
      if (!isSafeJSON(value[k])) return false;
    }
    return true;
  }
  return false; // function / symbol / undefined / bigint
}

class Verify {
  /**
   * @param {object} [opts]
   * @param {number} [opts.minReplicas] 判定所需最少一致副本数
   */
  constructor(opts = {}) {
    this.minReplicas = opts.minReplicas || 2;
  }

  /**
   * 对多副本结果做多数一致校验。
   * @param {Array<*>|Array<{nodeId:string,value:*}>} results 各节点返回的结果。
   *   当 opts.bound === true 时，视为带节点身份的 `{ nodeId, value }` 条目；
   *   同 nodeId 的重复提交只计一次（防 Sybil）。
   * @param {object} [opts]
   * @param {boolean} [opts.bound] 是否启用节点身份绑定
   * @returns {{trusted:boolean, result:*, agreement:number}}
   */
  verify(results, opts = {}) {
    if (!results || results.length === 0) {
      return { trusted: false, result: undefined, agreement: 0 };
    }
    const bound = opts.bound === true;

    // 1. 规范化 key + 净化，并做节点去重（同节点同结果仅计一次）
    const count = new Map(); // canonicalKey -> { n, sample }
    const seenNodeKey = new Set(); // bound 时去重 nodeId+key
    for (const item of results) {
      const nodeId = bound ? item.nodeId : undefined;
      const raw = bound ? item.value : item;

      // 1.4 净化：非法 JSON 值直接跳过，不计入一致性判定
      if (!isSafeJSON(raw)) continue;

      const key = canonicalStringify(raw);
      if (bound) {
        const nodeKey = nodeId + '::' + key;
        if (seenNodeKey.has(nodeKey)) continue; // 同节点重复提交只计一次
        seenNodeKey.add(nodeKey);
      }
      const entry = count.get(key) || { n: 0, sample: raw };
      entry.n += 1;
      count.set(key, entry);
    }

    // 2. 找出现次数最多的规范化 key
    let bestKey = null;
    let bestN = 0;
    let bestSample;
    let validTotal = 0; // 有效结果总数（去重/净化后参与判定的副本数）
    for (const [k, entry] of count) {
      validTotal += entry.n;
      if (entry.n > bestN) {
        bestN = entry.n;
        bestKey = k;
        bestSample = entry.sample;
      }
    }

    if (bestKey === null) {
      return { trusted: false, result: undefined, agreement: 0 };
    }
    // P1-01 严格多数判定：一致副本数必须超过有效结果总数的一半
    const trusted = bestN > validTotal / 2;
    return {
      trusted,
      result: trusted ? bestSample : undefined,
      agreement: bestN,
    };
  }
}

module.exports = { Verify, canonicalStringify, isSafeJSON };
