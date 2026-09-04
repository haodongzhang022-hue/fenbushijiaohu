'use strict';
/**
 * identity 模块 —— 身份签名 + Keystore 持久化（M1 + P1）
 *
 * 架构师接口契约（04 §3.1）：
 *   interface Identity {
 *     publicKey: string;                       // Ed25519 公钥
 *     sign(msg: string): string;
 *     verify(pubKey, msg, sig): boolean;
 *   }
 *
 * P1 增强：Keystore 本地加密持久化（16 号文档 §6）。
 */
const crypto = require('crypto');
const { Keystore } = require('./keystore');

class Identity {
  /**
   * @param {crypto.KeyObject} [keyPair] 已生成的密钥对；不传则自动生成
   */
  constructor(keyPair) {
    this._keyPair = keyPair || crypto.generateKeyPairSync('ed25519');
    this._publicKey = this._keyPair.publicKey.export({ type: 'spki', format: 'der' });
    this._privateKey = this._keyPair.privateKey.export({ type: 'pkcs8', format: 'der' });
  }

  /**
   * 返回 base64 编码的 Ed25519 公钥（DER/SPKI）
   */
  get publicKey() {
    return this._publicKey.toString('base64');
  }

  /**
   * 对消息签名，返回 base64 签名
   * @param {string} msg 待签名消息（必须是字符串）
   * @returns {string} base64 签名
   * @throws {TypeError} 当 msg 不是字符串时抛出自定义类型错误
   */
  sign(msg) {
    // P2-02 修复：类型防护，非字符串输入优雅抛出自定义错误
    if (typeof msg !== 'string') {
      throw new TypeError(`sign() 入参必须是字符串，收到 ${msg === null ? 'null' : typeof msg}`);
    }
    const data = Buffer.from(msg, 'utf8');
    return crypto.sign(null, data, this._keyPair.privateKey).toString('base64');
  }

  /**
   * 校验签名
   * @param {string} pubKey  base64 公钥
   * @param {string} msg     原始消息
   * @param {string} sig     base64 签名
   */
  verify(pubKey, msg, sig) {
    try {
      const keyObj = crypto.createPublicKey({
        key: Buffer.from(pubKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      return crypto.verify(
        null,
        Buffer.from(msg, 'utf8'),
        keyObj,
        Buffer.from(sig, 'base64')
      );
    } catch (e) {
      return false;
    }
  }
}

module.exports = { Identity, Keystore };
