'use strict';
/**
 * case-11 · Keystore 口令验证强度（身份持久化安全）
 *
 * bug 描述：Keystore 解锁时未校验口令强度，允许任意弱口令（如空串）
 * 解锁，且未做错误尝试次数限制，导致暴力破解风险。
 *
 * 正确行为：
 *   - 口令长度至少 8 位
 *   - 连续错误 5 次后锁定，需等待或重新生成
 *   - unlock(passphrase, isStrong) 返回是否成功
 *
 * 输入：(passphrase, attempts)
 * 输出：{ unlocked: boolean, locked: boolean, reason: string|null }
 */
function keystoreUnlock(passphrase, attempts) {
  if (attempts >= 5) {
    return { unlocked: false, locked: true, reason: '尝试次数超限' };
  }
  if (passphrase.length < 8) {
    return { unlocked: false, locked: false, reason: '口令过短' };
  }
  return { unlocked: true, locked: false, reason: null };
}

module.exports = keystoreUnlock;
