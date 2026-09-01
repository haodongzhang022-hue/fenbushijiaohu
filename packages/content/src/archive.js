'use strict';
/**
 * archive 模块 —— 115 冷存归档（M4b-B）
 *
 * 对齐 16-M4bM5M6与传输层设计 §2（Archive115）：
 *   将增量账本加密打包上传 115，支持一键恢复。
 *
 *   设计要点：
 *   - 冷存定位"防丢失"而非"热读"，规避高延迟冷存被当在线存储
 *   - archive(ledgerDelta)：加密 → 打包 → 上传 115
 *   - restore(cursor)：从 115 拉取 → 解密 → 还原
 *   - schedule(periodDays)：定期归档调度
 *
 *   R-115-限制 [HIGH]：115 仅授权归档后端，需处理 OAuth 过期续期、
 *   配额上限、上传速率限制。加密层用 AES-256-GCM 对称加密。
 *
 *   状态机：idle→encrypting→uploading→archived→restoring
 */
const crypto = require('crypto');

class Archive115 {
  /**
   * @param {object} [opts]
   * @param {CloudSync} [opts.sync] CloudSync 实例（取账本增量）
   * @param {object} [opts.archiveAdapter] 115 归档适配器（save/load/list），缺省为内存模拟
   * @param {string} [opts.encryptionKey] 加密密钥（默认自动生成临时密钥）
   */
  constructor(opts = {}) {
    this._sync = opts.sync || null;
    this._archive = opts.archiveAdapter || { _map: new Map() };
    this._encryptionKey = opts.encryptionKey || crypto.randomBytes(32).toString('hex');
    this._state = 'idle';
    this._archives = [];       // 归档记录 [{ archiveId, cursor, timestamp }]
    this._scheduleTimer = null;
    this._periodDays = 7;      // 默认每 7 天归档一次
    this._error = null;
  }

  /**
   * 将账本增量加密打包上传 115。
   * @param {Array} [ledgerDelta] 账本增量条目（默认取 sync 的完整账本）
   * @param {number} [cursor] 归档截至的游标
   * @returns {{archiveId:string, entries:number, cursor:number}}
   */
  async archive(ledgerDelta, cursor) {
    this._state = 'encrypting';
    try {
      const entries = ledgerDelta || (this._sync ? this._sync.getLedger() : []);
      if (!Array.isArray(entries) || entries.length === 0) {
        return { archiveId: null, entries: 0, cursor: cursor || 0 };
      }
      const maxCursor = cursor != null
        ? cursor
        : (entries.length > 0 ? Math.max(...entries.map((e) => e.seq || 0)) : 0);

      // 1. 加密
      const encrypted = this._encrypt(entries);
      // 2. 打包 + 生成 archiveId
      const archiveId = this._hash(`${Date.now()}:${maxCursor}`);
      const bundle = {
        archiveId,
        cursor: maxCursor,
        encrypted,
        timestamp: Date.now(),
        entryCount: entries.length,
      };
      // 3. 上传 115
      this._state = 'uploading';
      await this._archiveSave(archiveId, bundle);

      // 4. 在适配器中登记索引（供 restore 发现）
      await this._archiveAddIndex(bundle);

      this._archives.push({
        archiveId,
        cursor: maxCursor,
        timestamp: bundle.timestamp,
        entryCount: entries.length,
      });
      this._state = 'archived';
      return { archiveId, entries: entries.length, cursor: maxCursor };
    } catch (err) {
      this._state = 'error';
      this._error = err;
      throw err;
    }
  }

  /**
   * 从 115 拉取归档 → 解密 → 还原账本。
   * @param {number} [cursor] 还原截至的游标（缺省还原最新归档）
   * @returns {{entries:Array, archiveId:string, cursor:number}}
   */
  async restore(cursor) {
    this._state = 'restoring';
    try {
      // 从适配器中读取全部归档索引
      const allArchives = await this._archiveList();
      const target = this._findBestArchive(allArchives, cursor);
      if (!target) {
        return { entries: [], archiveId: null, cursor: cursor || 0 };
      }
      const bundle = await this._archiveLoad(target.archiveId);
      if (!bundle) {
        return { entries: [], archiveId: null, cursor: cursor || 0 };
      }
      // 解密还原
      const entries = this._decrypt(bundle.encrypted);
      this._state = 'archived';
      return { entries, archiveId: bundle.archiveId, cursor: bundle.cursor };
    } catch (err) {
      this._state = 'error';
      this._error = err;
      throw err;
    }
  }

  /**
   * 定期归档调度。
   * @param {number} [periodDays] 归档周期（天）
   * @returns {Archive115} this（便于链式调用）
   */
  async schedule(periodDays = 7) {
    this._periodDays = periodDays > 0 ? periodDays : 7;
    // 立即执行一次
    await this.archive(this._sync ? this._sync.getLedger() : []);
    // 设置定时器（真实环境中用 setInterval，测试环境可注入）
    if (typeof setInterval === 'function' && !this._scheduleTimer) {
      this._scheduleTimer = setInterval(async () => {
        try {
          await this.archive(this._sync ? this._sync.getLedger() : []);
        } catch (err) {
          this._error = err;
        }
      }, this._periodDays * 24 * 3600 * 1000);
    }
    return this;
  }

  /** 停止定时归档 */
  stopSchedule() {
    if (this._scheduleTimer && typeof clearInterval === 'function') {
      clearInterval(this._scheduleTimer);
      this._scheduleTimer = null;
    }
  }

  /** 归档记录列表（只读） */
  listArchives() {
    return this._archives.map((a) => ({ ...a }));
  }

  /** 获取当前状态 */
  getState() {
    return this._state;
  }

  /** 获取归档周期 */
  getPeriodDays() {
    return this._periodDays;
  }

  /** 最近一次归档的 archiveId（无则 null） */
  getLastArchiveId() {
    return this._archives.length > 0 ? this._archives[this._archives.length - 1].archiveId : null;
  }

  /** AES-256-GCM 加密 */
  _encrypt(data) {
    const key = Buffer.from(this._encryptionKey, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plain = Buffer.from(JSON.stringify(data), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv: iv.toString('hex'), tag: tag.toString('hex'), data: encrypted.toString('hex') };
  }

  /** AES-256-GCM 解密 */
  _decrypt(payload) {
    const key = Buffer.from(this._encryptionKey, 'hex');
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');
    const data = Buffer.from(payload.data, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  /** 指纹（SHA-256） */
  _hash(str) {
    return crypto.createHash('sha256').update(String(str)).digest('hex');
  }

  /** 找到最合适的归档（cursor <= 目标 且 最接近） */
  _findBestArchive(allArchives, cursor) {
    if (!allArchives || allArchives.length === 0) return null;
    const sorted = [...allArchives].sort((a, b) => a.cursor - b.cursor);
    // 找到 cursor <= 目标 且最接近的
    let best = null;
    for (const a of sorted) {
      if (cursor == null || a.cursor <= cursor) best = a;
    }
    return best || sorted[0]; // 若全大于 cursor，取最早的
  }

  /** 115 保存归档 */
  async _archiveSave(id, bundle) {
    if (this._archive && typeof this._archive.save === 'function') {
      return this._archive.save(id, bundle);
    }
    if (!this._archive._map) this._archive._map = new Map();
    this._archive._map.set(id, bundle);
    return true;
  }

  /** 115 读取归档 */
  async _archiveLoad(id) {
    if (this._archive && typeof this._archive.load === 'function') {
      return this._archive.load(id);
    }
    if (!this._archive._map) return null;
    return this._archive._map.get(id) || null;
  }

  /** 在适配器中登记索引 */
  async _archiveAddIndex(bundle) {
    // 尝试存储索引到专用键
    const indexKey = '__ARCHIVE_INDEX__';
    const index = await this._archiveLoad(indexKey) || { items: [] };
    const items = Array.isArray(index.items) ? index.items : [];
    items.push({
      archiveId: bundle.archiveId,
      cursor: bundle.cursor,
      timestamp: bundle.timestamp,
      entryCount: bundle.entryCount,
    });
    await this._archiveSave(indexKey, { items });
  }

  /** 从适配器读取全部归档索引 */
  async _archiveList() {
    const index = await this._archiveLoad('__ARCHIVE_INDEX__');
    if (index && Array.isArray(index.items)) return index.items;
    return [];
  }
}

module.exports = { Archive115 };
