'use strict';
/**
 * storage 模块 —— 本地存储缓存（M4）
 *
 * 对齐 02 §4 storage「本地持久化」+ 06-进度对齐 M4「缓存」：
 *   提供键值存储 + 缓存淘汰（LRU），并统计命中率。
 *
 *   class Storage {
 *     put(key, value): void;
 *     get(key): value|null;        // 命中返回，未命中返回 null
 *     delete(key): void;
 *     hitRate(): number;           // 缓存命中率
 *   }
 */
class Storage {
  /**
   * @param {number} [capacity] 缓存容量（0 表示不限）
   */
  constructor(capacity = 0) {
    this.capacity = capacity;
    this._store = new Map();
    this._hits = 0;
    this._misses = 0;
  }

  put(key, value) {
    if (this._store.has(key)) this._store.delete(key);
    this._store.set(key, value);
    // LRU 淘汰：超出容量移除最早访问的
    if (this.capacity > 0) {
      while (this._store.size > this.capacity) {
        const oldest = this._store.keys().next().value;
        this._store.delete(oldest);
      }
    }
    return value;
  }

  get(key) {
    if (!this._store.has(key)) {
      this._misses += 1;
      return null;
    }
    this._hits += 1;
    const value = this._store.get(key);
    this._store.delete(key);   // LRU：访问后移到末尾
    this._store.set(key, value);
    return value;
  }

  delete(key) {
    this._store.delete(key);
  }

  /** 缓存命中率 */
  hitRate() {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }

  get size() {
    return this._store.size;
  }
}

module.exports = { Storage };
