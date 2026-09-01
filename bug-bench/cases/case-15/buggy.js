'use strict';
/**
 * case-15 · Keystore 暴力破解防护（注入 bug）
 *
 * bug 描述：Keystore 口令验证中，成功验证后没有重置失败计数。
 * bug 版本在用户输入正确口令解锁后，failCount 仍然保留历史失败次数，
 * 导致用户只要曾经输错过 2 次口令，即使之后输对了再输错 1 次，
 * 就会被永久锁定（累积计数而非重新计数）。
 *
 * 正确行为：
 *   - 连续失败 maxAttempts 次后锁定（从当前 failCount 开始计数）
 *   - 成功验证后 failCount 重置为 0
 *   - 锁定后即使输入正确口令也拒绝解锁
 *
 * 输入：(attempts = ['wrong', 'correct', 'wrong', 'wrong'], config = { maxAttempts })
 * 输出：{ unlocked: boolean, lockCount: number, state: string }
 */
function bruteForceGuard(attempts, config) {
  const maxAttempts = (config && config.maxAttempts) || 3;
  let failCount = 0;
  let lockCount = 0;
  let state = 'active';
  let unlocked = false;

  for (const pwd of attempts) {
    if (state === 'permanent-locked') break;
    if (pwd === 'correct') {
      unlocked = true;
      state = 'active';
      // 修复：成功验证后必须重置 failCount = 0
      // bug 版本不重置
    } else {
      failCount++;
      if (failCount >= maxAttempts) {
        state = 'permanent-locked';
        lockCount++;
      }
    }
  }
  return { unlocked, lockCount, state };
}

module.exports = bruteForceGuard;
