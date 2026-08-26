'use strict';
/**
 * content 模块 —— 内容分发（M4）
 *
 * 对齐 02 §4 数据层 + 06-进度对齐 M4「视频分片/指纹去重/缓存」：
 *   - 分片：内容按固定块大小切分，便于多源并行拉取
 *   - 指纹去重：以内容哈希为唯一寻址键，相同内容只存一份
 *   - 分发：按指纹注册/查询副本
 *
 * WP-6 加固（安全审计 3.1 / 3.2）：
 *   3.1 指纹升级为完整 SHA-256（256-bit ≥ 128-bit），消除 64-bit 前缀碰撞风险。
 *   3.2 hash-data 一致性复核：`register` 校验指纹与内容哈希一致，`lookup`
 *       返回前复核存储一致性，防投毒 / 碰撞污染导致错误替换。
 */
const crypto = require('crypto');

class Content {
  constructor() {
    this._store = new Map(); // hash -> { seq, hash, data }
  }

  /**
   * 内容分片并计算指纹
   * @param {string} data
   * @param {number} [size] 分片大小
   */
  chunk(data, size = 4) {
    const chunks = [];
    for (let i = 0; i < data.length; i += size) {
      const piece = data.slice(i, i + size);
      const hash = this._hash(piece);
      chunks.push({ seq: i / size, hash, data: piece });
    }
    return chunks;
  }

  /**
   * 登记一个分片（按指纹去重，重复分片不重复存）。
   * 3.2：登记前复核指纹与内容哈希一致，不一致拒绝。
   * @param {{seq:number, hash:string, data:string}} chunk
   * @returns {boolean} 是否新登记（去重命中返回 false）
   */
  register(chunk) {
    if (!chunk || typeof chunk.data !== 'string' || typeof chunk.hash !== 'string') {
      throw new TypeError('非法分片：需含 data(string) 与 hash(string)');
    }
    // 3.2 一致性复核：指纹必须与内容哈希匹配
    if (this._hash(chunk.data) !== chunk.hash) {
      throw new Error(`分片指纹与内容不一致，拒绝登记（hash=${chunk.hash}）`);
    }
    if (this._store.has(chunk.hash)) return false; // 已存在，去重
    this._store.set(chunk.hash, chunk);
    return true;
  }

  /**
   * 按指纹取分片。3.2：返回前复核存储一致性，被污染则剔除。
   * @param {string} hash
   */
  lookup(hash) {
    const chunk = this._store.get(hash);
    if (!chunk) return null;
    // 3.2 返回前复核 hash-data 一致
    if (this._hash(chunk.data) !== chunk.hash) {
      this._store.delete(hash); // 剔除污染项
      return null;
    }
    return chunk;
  }

  /** 去重后的分片数 */
  uniqueCount() {
    return this._store.size;
  }

  /** 完整 SHA-256 指纹（256-bit，64 hex） */
  _hash(piece) {
    return crypto.createHash('sha256').update(piece).digest('hex');
  }
}

module.exports = { Content };
