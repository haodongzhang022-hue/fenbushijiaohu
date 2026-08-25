'use strict';
/**
 * case-04 测试断言
 * 正确行为：空消息也必须被投递（不丢失）。
 */
module.exports = {
  tests: [
    {
      name: 'case-04 空消息不被丢弃',
      fn: (transport) => {
        // 模拟一个对端，含 listen 与 _deliver
        const nodeB = {
          _listener: null,
          listen(cb) { this._listener = cb; },
          _deliver(m) { if (this._listener) this._listener(m); },
        };
        const msgs = [{ payload: '' }, { payload: 'non-empty' }];
        const received = transport(msgs, nodeB);
        // 两条消息都应被投递
        return received === 2;
      },
    },
  ],
};
