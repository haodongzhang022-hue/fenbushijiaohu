'use strict';
/**
 * case-11 测试断言（Keystore 口令验证）
 * 主断言：弱口令必须拒绝。
 * 回归断言：正常口令 + 错误次数限制不能破坏正常路径。
 */
module.exports = {
  tests: [
    {
      name: 'case-11 弱口令（<8 位）必须拒绝',
      fn: (f) => {
        const r = f('abc', 0);
        return r.unlocked === false && r.reason === '口令过短';
      },
    },
    {
      name: 'case-11 空口令必须拒绝',
      fn: (f) => {
        const r = f('', 0);
        return r.unlocked === false && r.reason === '口令过短';
      },
    },
    {
      name: 'case-11 连续错误 5 次后锁定',
      fn: (f) => {
        const r = f('correct-password', 5);
        return r.unlocked === false && r.locked === true && r.reason === '尝试次数超限';
      },
    },
    {
      name: 'case-11 正常口令可解锁',
      fn: (f) => {
        const r = f('correct-password', 0);
        return r.unlocked === true && r.locked === false && r.reason === null;
      },
    },
    {
      name: 'case-11 错误 4 次尚未锁定（边界）',
      fn: (f) => {
        const r = f('correct-password', 4);
        return r.unlocked === true && r.locked === false;
      },
    },
  ],
};
