'use strict';
/**
 * case-06 测试断言（高区分度）
 * 正确行为：同 ts 不同内容必须走冲突合并，不得丢失。
 */
module.exports = {
  tests: [
    {
      name: 'case-06 同 ts 不同内容走冲突合并不丢失',
      fn: (dedup) => {
        const stored = [{ ts: 3, contentHash: 'aaa' }];
        const r = dedup(stored, { ts: 3, contentHash: 'bbb' });
        return r.lostConflict === false && stored.length === 1 && stored[0].contentHash === 'bbb';
      },
    },
    {
      name: 'case-06 同 ts 同内容去重',
      fn: (dedup) => {
        const stored = [{ ts: 3, contentHash: 'aaa' }];
        const r = dedup(stored, { ts: 3, contentHash: 'aaa' });
        return r.mergedCount === 1 && stored.length === 1;
      },
    },
    {
      name: 'case-06 新 ts 追加',
      fn: (dedup) => {
        const stored = [{ ts: 1, contentHash: 'x' }];
        const r = dedup(stored, { ts: 2, contentHash: 'y' });
        return r.mergedCount === 2 && stored.length === 2;
      },
    },
  ],
};
