'use strict';
/**
 * case-16 测试断言（游戏大厅容量约束）
 * 主断言：房间已满必须拒绝加入，不得只查延迟。
 */
module.exports = {
  tests: [
    {
      name: 'case-16 房间已满拒绝加入（容量约束）',
      fn: (f) => {
        const room = { playerCount: 10, capacity: 10, latencyBudget: 50 };
        const player = { latency: 20 };
        const r = f(room, player);
        return r.accepted === false && r.reason === '房间已满';
      },
    },
    {
      name: 'case-16 延迟超预算拒绝加入',
      fn: (f) => {
        const room = { playerCount: 2, capacity: 10, latencyBudget: 50 };
        const player = { latency: 80 };
        const r = f(room, player);
        return r.accepted === false && r.reason === '延迟超预算';
      },
    },
    {
      name: 'case-16 房间未满且延迟正常允许加入',
      fn: (f) => {
        const room = { playerCount: 2, capacity: 10, latencyBudget: 50 };
        const player = { latency: 30 };
        const r = f(room, player);
        return r.accepted === true && r.reason === null;
      },
    },
    {
      name: 'case-16 容量边界值（playerCount == capacity 视为已满）',
      fn: (f) => {
        const room = { playerCount: 10, capacity: 10, latencyBudget: 50 };
        const player = { latency: 10 };
        const r = f(room, player);
        return r.accepted === false;
      },
    },
  ],
};
