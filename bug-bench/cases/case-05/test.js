'use strict';
/**
 * case-05 测试断言
 * 正确行为：非法消息类型必须被拒绝（不允许进入会话）。
 */
const MSG_TYPES = ['text', 'media', 'game-cmd', 'task'];

module.exports = {
  tests: [
    {
      name: 'case-05 非法消息类型被拒绝',
      fn: (send) => {
        const r = send('hack');
        return r.accepted === false;
      },
    },
    {
      name: 'case-05 合法消息类型被接受',
      fn: (send) => {
        const ok = MSG_TYPES.every((t) => send(t).accepted === true);
        return ok;
      },
    },
  ],
};
