'use strict';
/**
 * archive 模块 —— 115 冷存归档（M4b）
 *
 * 对齐 09-审查补充与增强 §4.2 对接 115 冷存储：
 *   - 本地数据加密后打包成归档块
 *   - 定期将增量评论/视频元数据/信誉快照上传到 115 目录
 *   - 仅存加密归档，115 侧无法读取明文
 *   - 提供一键恢复：从 115 拉取归档解包还原
 *
 * 设计：
 *   - 归档块 = { version, createdAt, encrypted: base64密文, checksum }
 *   - 加密用简单的 XOR+base64（纯逻辑包演示），生产环境应换强加密
 *   - 归档后端模拟为内存 Map（未来对接 115 API）
 *   - 归档包可通过解密和 checksum 校验恢复
 *
 *   class Archive {
 *     archive(data): {key, block};   // 加密归档
 *     restore(key): data|null;       // 解密恢复
 *     list(): Array<key>;            // 列出归档
 *   }
 */
const crypto = require('crypto');

class Archive {
  constructor() {
    this._vault = new Map(); // key -> { encrypted, checksum, createdAt }
    this._keys = new Map();  // key -> encryptionKey（演示用，生产应存本地）
  }

  /**
   * 将数据加密并归档到冷存
   * @param {string|object} data 待归档数据
   * @param {object} [opts]
   * @param {string} [opts.key] 指定归档键（缺省自动生成）
   * @returns {{key:string, block:object}}
   */
  archive(data, opts = {}) {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    const key = opts.key || `arch-${crypto.randomBytes(8).toString('hex')}-${Date.now()}`;
    const encryptionKey = crypto.randomBytes(32).toString('hex');
    const encrypted = this._encrypt(raw, encryptionKey);
    const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
    const block = {
      version: 1,
      key,
      encrypted,
      checksum,
      createdAt: Date.now(),
    };
    this._vault.set(key, block);
    this._keys.set(key, encryptionKey);
    return { key, block };
  }

  /**
   * 从冷存恢复数据
   * @param {string} key 归档键
   * @returns {string|null} 解密后的原始数据
   */
  restore(key) {
    const block = this._vault.get(key);
    if (!block) return null;
    // 完整性校验
    const actual = crypto.createHash('sha256').update(block.encrypted).digest('hex');
    if (actual !== block.checksum) {
      return null; // 数据被篡改
    }
    const encryptionKey = this._keys.get(key);
    if (!encryptionKey) return null;
    return this._decrypt(block.encrypted, encryptionKey);
  }

  /** 列出所有归档键 */
  list() {
    return [...this._vault.keys()];
  }

  /** 删除归档 */
  remove(key) {
    this._vault.delete(key);
    this._keys.delete(key);
  }

  /** 归档数量 */
  get size() {
    return this._vault.size;
  }

  /** 演示用对称加密：AES-256-CTR */
  _encrypt(data, keyHex) {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64');
  }

  /** 演示用对称解密 */
  _decrypt(base64, keyHex) {
    try {
      const buf = Buffer.from(base64, 'base64');
      const iv = buf.subarray(0, 16);
      const encrypted = buf.subarray(16);
      const key = Buffer.from(keyHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}

module.exports = { Archive };
