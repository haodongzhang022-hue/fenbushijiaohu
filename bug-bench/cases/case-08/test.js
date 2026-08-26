'use strict';
/**
 * case-08 测试断言（高区分度·回归陷阱）
 * 主断言：负值必须被拒绝；回归断言：正常累加路径不得被破坏。
 */
module.exports = {
  tests: [
    { name: 'case-08 含负值必须拒绝', fn: (f) => { const r = f([1, 2, -3]); return r.accepted === false && r.sum === 0; } },
    { name: 'case-08 正常累加', fn: (f) => { const r = f([1, 2, 3]); return r.accepted === true && r.sum === 6; } },
    { name: 'case-08 单元素', fn: (f) => { const r = f([5]); return r.accepted === true && r.sum === 5; } },
    { name: 'case-08 空数组 sum=0', fn: (f) => { const r = f([]); return r.accepted === true && r.sum === 0; } },
    { name: 'case-08 大数累加不丢前序', fn: (f) => { const r = f([1, 2, 3, 4, 5]); return r.accepted === true && r.sum === 15; } },
  ],
};
