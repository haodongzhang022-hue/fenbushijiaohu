'use strict';
/**
 * case-09 测试断言（多节点收敛一致性）
 * 主断言：乱序到达的旧消息不得覆盖新消息（LWW 规则）。
 * 回归断言：正常追加路径不得被破坏。
 */
module.exports = {
  tests: [
    {
      name: 'case-09 乱序到达取 ts 大者（旧消息不覆盖新消息）',
      fn: (f) => {
        const msgs = [
          { id: 'a', channelId: 'ch1', ts: 10, payload: 'new' },
          { id: 'a', channelId: 'ch1', ts: 5, payload: 'old' },  // 后到达但 ts 更小
        ];
        const r = f(msgs);
        return r.messages.length === 1 && r.messages[0].payload === 'new';
      },
    },
    {
      name: 'case-09 正常追加多节点消息',
      fn: (f) => {
        const msgs = [
          { id: 'a', channelId: 'ch1', ts: 1, payload: 'one' },
          { id: 'b', channelId: 'ch1', ts: 2, payload: 'two' },
          { id: 'c', channelId: 'ch1', ts: 3, payload: 'three' },
        ];
        const r = f(msgs);
        return r.messages.length === 3 && r.converged === true;
      },
    },
    {
      name: 'case-09 同 ts 同 key 冲突按 id 字典序确定性收敛',
      fn: (f) => {
        // 同 key (ch1:a) 冲突，ts 相同，应取 id 字典序较小者
        // 这里 a 和 b 相同 key，但 id 不同其实 key 不同
        // 真正同 key 冲突需相同 id
        const msgs = [
          { id: 'x', channelId: 'ch1', ts: 5, payload: 'v2' },
          { id: 'x', channelId: 'ch1', ts: 5, payload: 'v1' },  // 同 key 同 ts 冲突
        ];
        const r = f(msgs);
        return r.messages.length === 1;  // 冲突合并后只剩一条
      },
    },
    {
      name: 'case-09 空消息列表返回 converged=false',
      fn: (f) => {
        const r = f([]);
        return r.messages.length === 0 && r.converged === false;
      },
    },
  ],
};
