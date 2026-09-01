'use strict';
/**
 * case-10 测试断言（传输可靠性：分片完整性校验）
 * 主断言：缺少分片必须报错，不得返回部分数据。
 * 回归断言：分片齐全的正常路径不得被破坏。
 */
module.exports = {
  tests: [
    {
      name: 'case-10 缺少分片必须报错',
      fn: (f) => {
        const shards = [
          { seq: 0, total: 3, data: 'ab' },
          { seq: 2, total: 3, data: 'ef' },  // 缺少 seq=1
        ];
        const r = f(shards);
        return r.content === null && r.error !== null;
      },
    },
    {
      name: 'case-10 分片齐全正常拼接',
      fn: (f) => {
        const shards = [
          { seq: 0, total: 3, data: 'ab' },
          { seq: 1, total: 3, data: 'cd' },
          { seq: 2, total: 3, data: 'ef' },
        ];
        const r = f(shards);
        return r.content === 'abcdef' && r.error === null;
      },
    },
    {
      name: 'case-10 乱序分片按序号重组',
      fn: (f) => {
        const shards = [
          { seq: 2, total: 4, data: 'gh' },
          { seq: 0, total: 4, data: 'ab' },
          { seq: 3, total: 4, data: 'ij' },
          { seq: 1, total: 4, data: 'cd' },
        ];
        const r = f(shards);
        return r.content === 'abcdghij' && r.error === null;
      },
    },
    {
      name: 'case-10 空分片列表返回错误',
      fn: (f) => {
        const r = f([]);
        return r.content === null && r.error !== null;
      },
    },
  ],
};
