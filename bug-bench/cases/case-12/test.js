'use strict';
/**
 * case-12 测试断言（游戏大厅延迟预算校验）
 * 主断言：超延迟预算必须拒绝匹配。
 * 回归断言：正常延迟的匹配路径不得被破坏。
 */
module.exports = {
  tests: [
    {
      name: 'case-12 玩家延迟超预算拒绝匹配',
      fn: (f) => {
        const players = [
          { id: 'p1', latency: 50 },
          { id: 'p2', latency: 150 },  // 超 100ms 预算
        ];
        const r = f(players, 100);
        return r.matched === false && r.matchedPlayers.length === 0;
      },
    },
    {
      name: 'case-12 正常延迟匹配成功',
      fn: (f) => {
        const players = [
          { id: 'p1', latency: 50 },
          { id: 'p2', latency: 80 },
        ];
        const r = f(players, 100);
        return r.matched === true && r.matchedPlayers.length === 2;
      },
    },
    {
      name: 'case-12 等于预算值视为可匹配（边界）',
      fn: (f) => {
        const players = [
          { id: 'p1', latency: 100 },
          { id: 'p2', latency: 50 },
        ];
        const r = f(players, 100);
        return r.matched === true;
      },
    },
    {
      name: 'case-12 玩家不足不匹配',
      fn: (f) => {
        const r = f([{ id: 'p1', latency: 50 }], 100);
        return r.matched === false && r.reason === '玩家不足';
      },
    },
    {
      name: 'case-12 空玩家列表不匹配',
      fn: (f) => {
        const r = f([], 100);
        return r.matched === false && r.reason === '玩家不足';
      },
    },
  ],
};
