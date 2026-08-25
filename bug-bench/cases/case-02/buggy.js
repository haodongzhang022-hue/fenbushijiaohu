'use strict';
/**
 * case-02 · identity 验签被绕过（注入 bug）
 *
 * bug 描述：verify() 在校验失败时没有 catch 异常并返回 false，
 * 而是让异常向上抛出；更严重的是，当公钥格式非法时本应返回 false
 * （拒绝），但 bug 版本在异常时错误地返回 true，导致验签被绕过。
 *
 * 正确行为：任何验签失败（签名不匹配 / 公钥非法 / 消息被篡改）
 * 都必须返回 false，绝不返回 true。
 *
 * 输入：(pubKey, msg, sig)
 * 输出：verify 布尔结果
 */
const crypto = require('crypto');

// —— 含 bug 的实现 ——
function buggyVerify(pubKeyB64, msg, sig) {
  try {
    const keyObj = crypto.createPublicKey({
      key: Buffer.from(pubKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, Buffer.from(msg, 'utf8'), keyObj, Buffer.from(sig, 'base64'));
  } catch (e) {
    // BUG: 异常时应返回 false（拒绝），这里错误地返回 true（放行）
    return true;
  }
}

module.exports = buggyVerify;
