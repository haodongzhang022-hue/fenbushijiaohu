'use strict';
/**
 * identity 模块 —— 身份签名（M1 最小实现）
 *
 * 架构师接口契约（04 §3.1）：
 *   interface Identity {
 *     publicKey: string;                       // Ed25519 公钥
 *     sign(msg: string): string;
 *     verify(pubKey, msg, sig): boolean;
 *   }
 *
 * 为保持最小可测、零外部依赖，本实现使用 Node 内置 crypto 的 Ed25519
 * （Node >= 12 的 crypto.sign / crypto.verify 支持 Ed25519）。
 * 这是纯逻辑层，不绑定任何平台。
 */
const crypto = require('crypto');

class Identity {
  /**
   * @param {crypto.KeyObject} [keyPair] 已生成的密钥对；不传则自动生成
   */
  constructor(keyPair) {
    // 复用或生成 Ed25519 密钥对
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
   * @param {string} msg
   */
  sign(msg) {
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

module.exports = { Identity };
