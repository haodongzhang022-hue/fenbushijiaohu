'use strict';
/**
 * identity/keystore 模块 —— 身份凭据持久化（P1）
 *
 * 对齐 16 号文档 §6 身份凭据持久化（Keystore）：
 *   模块：identity/keystore.js
 *   职责：本地安全持久化 Ed25519 密钥，绑定长期身份
 *   输入：generate() / unlock(passphrase)
 *   输出：公钥（可验证身份）、签名
 *   依赖：本地安全存储（加密 at-rest）
 *   风险：[MEDIUM] 密钥丢失、口令遗忘
 *   状态机：generated→locked→active→revoked
 *
 * 实现：使用 Node 内置 crypto 的 Ed25519 密钥对，通过 AES-256-GCM
 * 加密私钥后持久化到本地存储（默认内存 map，可通过 store 参数注入
 * 文件/浏览器 localStorage 等持久化后端）。加密密钥由用户口令
 * 经 PBKDF2 派生。
 */

const crypto = require('crypto');

// AES-256-GCM 加密密钥派生参数
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // AES-256
const SALT_BYTES = 16;
const IV_BYTES = 12;

/**
 * 从口令派生 AES-256 密钥（PBKDF2-SHA256）
 * @param {string} passphrase
 * @param {Buffer} salt
 */
function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * AES-256-GCM 加密（返回 { ciphertext, iv, tag }）
 * @param {Buffer} key
 * @param {Buffer} plaintext
 */
function aesEncrypt(key, plaintext) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

/**
 * AES-256-GCM 解密
 * @param {Buffer} key
 * @param {{ciphertext:Buffer, iv:Buffer, tag:Buffer}} enc
 */
function aesDecrypt(key, enc) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, enc.iv);
  decipher.setAuthTag(enc.tag);
  return Buffer.concat([decipher.update(enc.ciphertext), decipher.final()]);
}

class Keystore {
  /**
   * @param {object} [opts]
   * @param {object} [opts.store] 持久化后端（需实现 get/set/delete），默认内存 Map
   * @param {number} [opts.iterations] PBKDF2 迭代次数（默认 100000）
   */
  constructor(opts = {}) {
    this._store = opts.store || new Map();
    this._iterations = opts.iterations || PBKDF2_ITERATIONS;
    this._keyPair = null;          // 当前已加载的密钥对
    this._state = 'generated';     // generated→locked→active→revoked
  }

  /** 当前状态 */
  get state() {
    return this._state;
  }

  /**
   * 生成并持久化 Ed25519 密钥对
   * @param {string} passphrase 加密口令
   * @returns {{publicKey:string, keyId:string}}
   */
  async generate(passphrase) {
    if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 4) {
      throw new Error('口令至少 4 个字符');
    }
    const keyPair = crypto.generateKeyPairSync('ed25519');
    const publicKey = keyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const privateKeyDer = keyPair.privateKey.export({ type: 'pkcs8', format: 'der' });

    // 生成随机盐并用口令派生密钥
    const salt = crypto.randomBytes(SALT_BYTES);
    const key = deriveKey(passphrase, salt);

    // 加密私钥
    const enc = aesEncrypt(key, privateKeyDer);

    // 计算 keyId（公钥哈希）
    const keyId = crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);

    // 持久化到本地存储
    const record = {
      keyId,
      publicKey,
      salt: salt.toString('base64'),
      iterations: this._iterations,
      iv: enc.iv.toString('base64'),
      tag: enc.tag.toString('base64'),
      ciphertext: enc.ciphertext.toString('base64'),
      algorithm: 'ed25519+aes-256-gcm',
      createdAt: Date.now(),
      state: 'locked',
    };

    this._store.set(`keystore:${keyId}`, JSON.stringify(record));
    this._keyPair = keyPair;
    this._state = 'locked';
    return { publicKey, keyId };
  }

  /**
   * 解锁密钥（验证口令并加载密钥对）
   * @param {string} keyId
   * @param {string} passphrase
   */
  async unlock(keyId, passphrase) {
    const raw = this._store.get(`keystore:${keyId}`);
    if (!raw) throw new Error(`未找到密钥 ${keyId}`);
    const record = JSON.parse(raw);

    // 用口令+盐派生密钥并解密
    const salt = Buffer.from(record.salt, 'base64');
    const key = deriveKey(passphrase, salt);
    const enc = {
      ciphertext: Buffer.from(record.ciphertext, 'base64'),
      iv: Buffer.from(record.iv, 'base64'),
      tag: Buffer.from(record.tag, 'base64'),
    };

    try {
      const privateKeyDer = aesDecrypt(key, enc);
      this._keyPair = {
        publicKey: crypto.createPublicKey({
          key: Buffer.from(record.publicKey, 'base64'),
          format: 'der',
          type: 'spki',
        }),
        privateKey: crypto.createPrivateKey({
          key: privateKeyDer,
          format: 'der',
          type: 'pkcs8',
        }),
      };
      this._state = 'active';
      return { publicKey: record.publicKey, keyId };
    } catch (e) {
      throw new Error('口令错误或密钥损坏');
    }
  }

  /**
   * 锁定密钥（卸载私钥，从内存清除）
   */
  lock() {
    this._keyPair = null;
    this._state = 'locked';
  }

  /**
   * 撤销密钥（从存储删除）
   * @param {string} keyId
   */
  async revoke(keyId) {
    this._store.delete(`keystore:${keyId}`);
    if (this._keyPair) this._keyPair = null;
    this._state = 'revoked';
  }

  /** 当前是否已解锁 */
  get isUnlocked() {
    return this._state === 'active' && this._keyPair !== null;
  }

  /**
   * 对消息签名（需已解锁）
   * @param {string} msg
   */
  sign(msg) {
    if (!this.isUnlocked) throw new Error('密钥未解锁');
    return crypto.sign(null, Buffer.from(msg, 'utf8'), this._keyPair.privateKey).toString('base64');
  }

  /**
   * 校验签名（无需解锁）
   * @param {string} publicKey base64 公钥
   * @param {string} msg 原始消息
   * @param {string} sig base64 签名
   */
  verify(publicKey, msg, sig) {
    try {
      const keyObj = crypto.createPublicKey({
        key: Buffer.from(publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      return crypto.verify(null, Buffer.from(msg, 'utf8'), keyObj, Buffer.from(sig, 'base64'));
    } catch (e) {
      return false;
    }
  }

  /** 列出本地已持久化的密钥 */
  listKeys() {
    const keys = [];
    for (const [k, v] of this._store.entries()) {
      if (k.startsWith('keystore:')) {
        const rec = JSON.parse(v);
        keys.push({ keyId: rec.keyId, publicKey: rec.publicKey, createdAt: rec.createdAt, state: rec.state });
      }
    }
    return keys;
  }
}

module.exports = { Keystore };
