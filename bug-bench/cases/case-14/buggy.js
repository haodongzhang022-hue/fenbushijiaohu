'use strict';
/**
 * case-14 · 信令重连：心跳超时重连策略（注入 bug）
 *
 * bug 描述：重连策略中「重连成功」后没有重置 retries 计数器。
 * bug 版本在节点恢复在线后，retries 仍保留历史失败次数，
 * 导致节点一旦有过瞬时抖动，即使已经重连成功，
 * 后续再抖动 1-2 次就被误判为永久离线。
 *
 * 正确行为：
 *   - 重连成功 → retries 重置为 0
 *   - 连续失败达到 maxRetries 才判定 dead
 *   - 恢复在线后再次抖动，应从 0 重新计数
 *
 * 输入：(history = [每次是否失败的布尔数组], config = { maxRetries })
 * 输出：{ state: 'connected'|'dead', finalRetries: number }
 */
function reconnectPolicy(history, config) {
  const maxRetries = (config && config.maxRetries) || 3;
  let state = 'connected';
  let retries = 0;

  for (const failed of history) {
    if (failed) {
      retries++;
      state = retries >= maxRetries ? 'dead' : 'reconnecting';
    } else {
      // 重连成功
      // 修复：必须重置 retries 为 0
      state = 'connected';
      retries = 0;
    }
  }
  return { state, finalRetries: retries };
}

module.exports = reconnectPolicy;
