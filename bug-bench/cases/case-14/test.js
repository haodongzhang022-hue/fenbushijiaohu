'use strict';
/**
 * case-14 测试断言（信令重连策略）
 * 主断言：重连成功后 retries 必须重置，不得累积历史失败。
 */
module.exports = {
  tests: [
    {
      name: 'case-14 重连成功后 retries 重置',
      fn: (f) => {
        // 失败2次，然后成功，再失败1次
        // 正确行为：retries 应从 0 重新开始，所以最终只有1次计数
        // bug 版本：retries 不重置，累积到3次 → 判定 dead
        const r = f([true, true, false, true], { maxRetries: 3 });
        return r.state === 'reconnecting' && r.finalRetries === 1;
      },
    },
    {
      name: 'case-14 连续失败达到上限判定 dead',
      fn: (f) => {
        const r = f([true, true, true], { maxRetries: 3 });
        return r.state === 'dead' && r.finalRetries === 3;
      },
    },
    {
      name: 'case-14 全部成功保持在线',
      fn: (f) => {
        const r = f([false, false, false], { maxRetries: 3 });
        return r.state === 'connected' && r.finalRetries === 0;
      },
    },
    {
      name: 'case-14 重连成功后多次失败重新计数',
      fn: (f) => {
        // 失败2次 → 成功 → 再失败2次
        // 正确：finalRetries=2, state='reconnecting'（因重置后只有2次失败）
        // bug：retries 不重置，累积到4次 → dead
        const r = f([true, true, false, true, true], { maxRetries: 3 });
        return r.state === 'reconnecting' && r.finalRetries === 2;
      },
    },
  ],
};
