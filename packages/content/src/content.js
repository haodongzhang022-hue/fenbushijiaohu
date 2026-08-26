'use strict';
/**
 * content 模块 —— 内容分发（M4）
 *
 * 对齐 02 §4 数据层 + 06-进度对齐 M4「视频分片/指纹去重/缓存」：
 *   - 分片：内容按固定块大小切分，便于多源并行拉取
 *   - 指纹去重：以内容哈希为唯一寻址键，相同内容只存一份
 *   - 分发：按指纹注册/查询副本
 *
 *   class Content {
 *     chunk(data, size): Array<{seq, hash, data}>   // 分片 + 指纹
 *     register(chunk): void;                         // 登记分片（去重）
 *     lookup(hash): chunk|null;                      // 按指纹取分片
 *     uniqueCount(): number                          // 去重后的分片数
 *   }
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
   * 登记一个分片（按指纹去重，重复分片不重复存）
   */
  register(chunk) {
    if (this._store.has(chunk.hash)) return false; // 已存在，去重
    this._store.set(chunk.hash, chunk);
    return true;
  }

  /** 按指纹取分片 */
  lookup(hash) {
    return this._store.get(hash) || null;
  }

  /** 去重后的分片数 */
  uniqueCount() {
    return this._store.size;
  }

  /** SHA-256 指纹 */
  _hash(piece) {
    return crypto.createHash('sha256').update(piece).digest('hex').slice(0, 16);
  }
}

module.exports = { Content };
