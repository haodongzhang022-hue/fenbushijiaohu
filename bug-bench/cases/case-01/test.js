'use strict';
/**
 * case-01 测试断言
 * 正确行为：收到远端 ts=T 后，本地再发消息必须 ts > T（因果序）。
 */
module.exports = {
  tests: [
    {
      name: 'case-01 收到远端高时钟后本地消息严格递增',
      fn: (scenario) => {
        const r = scenario(5);   // 收到远端 ts=5
        return r.causalOk === true && r.localNextTs > 5;
      },
    },
  ],
};
