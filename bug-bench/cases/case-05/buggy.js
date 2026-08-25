'use strict';
/**
 * case-05 · session 消息类型校验缺失（注入 bug）
 *
 * bug 描述：send() 未校验消息 type 是否在白名单内，允许任意非法类型
 * 进入会话，破坏消息契约（04 §3.2：type 仅允许 text/media/game-cmd/task）。
 *
 * 正确行为：非法消息类型必须被拒绝（抛错或返回 false）。
 *
 * 输入：(type)
 * 输出：{ accepted: boolean }
 */
const MSG_TYPES = ['text', 'media', 'game-cmd', 'task'];

function buggySend(type) {
  // 修复：校验消息类型是否在白名单内，非法类型必须被拒绝
  return { accepted: MSG_TYPES.includes(type), type };
}

module.exports = buggySend;
