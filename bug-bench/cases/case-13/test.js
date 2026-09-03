'use strict';
/**
 * case-13 测试断言（信令服务路由正确性）
 * 主断言：目标不在线必须返回未投递，不得假成功。
 * 回归断言：目标在线时必须正确投递。
 */
module.exports = {
  tests: [
    {
      name: 'case-13 目标不在线返回未投递',
      fn: (f) => {
        const r = f(['node-a', 'node-b'], 'ghost-node', 'node-a');
        return r.delivered === false && r.error !== null;
      },
    },
    {
      name: 'case-13 目标在线正常投递',
      fn: (f) => {
        const r = f(['node-a', 'node-b', 'node-c'], 'node-b', 'node-a');
        return r.delivered === true && r.error === null;
      },
    },
    {
      name: 'case-13 不能给自己发信令',
      fn: (f) => {
        const r = f(['node-a', 'node-b'], 'node-a', 'node-a');
        return r.delivered === false && r.error !== null;
      },
    },
    {
      name: 'case-13 空房间返回错误',
      fn: (f) => {
        const r = f([], 'node-a', 'node-b');
        return r.delivered === false && r.error !== null;
      },
    },
    {
      name: 'case-13 非法目标返回错误',
      fn: (f) => {
        const r = f(['node-a'], '', 'node-a');
        return r.delivered === false && r.error !== null;
      },
    },
  ],
};
