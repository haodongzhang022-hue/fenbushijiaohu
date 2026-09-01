'use strict';
/**
 * case-15 测试断言（Keystore 暴力破解防护）
 * 主断言：成功验证后 failCount 必须重置，不得累积。
 */
module.exports = {
  tests: [
    {
      name: 'case-15 成功后失败计数重置（不累积锁定）',
      fn: (f) => {
        // 错误1次 → 正确 → 再错2次
        // 正确：failCount 重置后只有2次失败，未达上限3 → 不锁定
        // bug：failCount 累积到3次 → 锁定
        const r = f(['wrong', 'correct', 'wrong', 'wrong'], { maxAttempts: 3 });
        return r.state === 'active' && r.unlocked === true;
      },
    },
    {
      name: 'case-15 连续失败达到上限锁定',
      fn: (f) => {
        const r = f(['wrong', 'wrong', 'wrong'], { maxAttempts: 3 });
        return r.state === 'permanent-locked' && r.lockCount === 1;
      },
    },
    {
      name: 'case-15 全部正确直接解锁',
      fn: (f) => {
        const r = f(['correct'], { maxAttempts: 3 });
        return r.unlocked === true && r.state === 'active';
      },
    },
    {
      name: 'case-15 锁定后正确口令也被拒绝',
      fn: (f) => {
        const r = f(['wrong', 'wrong', 'wrong', 'correct'], { maxAttempts: 3 });
        return r.state === 'permanent-locked' && r.unlocked === false;
      },
    },
  ],
};
