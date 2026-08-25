'use strict';
/**
 * case-03 测试断言
 * 正确行为：offline 禁止广播且禁止中继；online+NAT失败走中继。
 */
module.exports = {
  tests: [
    {
      name: 'case-03 offline 禁止广播且禁止中继',
      fn: (p) => {
        const r = p({ mode: 'offline', natFailed: true });
        return r.canBroadcast === false && r.shouldUseRelay === false;
      },
    },
    {
      name: 'case-03 online 可广播，NAT 失败走中继',
      fn: (p) => {
        const r = p({ mode: 'online', natFailed: true });
        return r.canBroadcast === true && r.shouldUseRelay === true;
      },
    },
  ],
};
