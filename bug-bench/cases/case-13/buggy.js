'use strict';
/**
 * case-13 · 信令服务路由正确性（注入 bug）
 *
 * bug 描述：信令服务在路由消息时，未校验目标节点是否在线。
 * 当目标不在房间时，bug 版本仍然返回「投递成功」，导致发送方
 * 误以为信令已送达，实际对端从未收到。
 *
 * 正确行为：
 *   - 目标节点不在房间内：返回 { delivered: false, error: '目标不在线' }
 *   - 目标节点在线：正确投递并返回 { delivered: true }
 *   - 空目标/非法目标：返回 { delivered: false, error: '非法目标' }
 *
 * 输入：(roomPeers = string[], target, from)
 * 输出：{ delivered: boolean, error: string|null }
 */
function routeSignal(roomPeers, target, from) {
  if (!Array.isArray(roomPeers) || roomPeers.length === 0) {
    return { delivered: false, error: '房间为空' };
  }
  if (!target || typeof target !== 'string') {
    return { delivered: false, error: '非法目标' };
  }
  if (!roomPeers.includes(target)) {
    // 修复：目标不在线时必须返回未投递
    return { delivered: false, error: '目标不在线' };
  }
  // 排除发送者自身
  if (target === from) {
    return { delivered: false, error: '不能给自己发信令' };
  }
  return { delivered: true, error: null };
}

module.exports = routeSignal;
