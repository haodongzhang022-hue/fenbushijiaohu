'use strict';
/**
 * case-16 · 游戏大厅匹配：延迟与容量联合约束（注入 bug）
 *
 * bug 描述：游戏大厅匹配逻辑中，缺少「房间容量校验」。
 * bug 版本只校验玩家延迟预算，不考虑房间是否已满，
 * 导致超过容量上限的玩家也被加入房间。
 *
 * 正确行为：
 *   - 房间已有 playerCount 人，容量 capacity
 *   - 若 playerCount >= capacity：拒绝加入
 *   - 若玩家延迟 > latencyBudget：拒绝加入
 *   - 两者都满足：允许加入
 *
 * 输入：(room = { playerCount, capacity, latencyBudget }, player = { latency })
 * 输出：{ accepted: boolean, reason: string|null }
 */
function matchJoin(room, player) {
  const latencyBudget = room.latencyBudget || 50;
  // 修复：必须检查房间容量 playerCount >= capacity
  // bug 版本缺少容量检查，只检查延迟
  if (player.latency > latencyBudget) {
    return { accepted: false, reason: '延迟超预算' };
  }
  // bug：直接接受，不检查容量
  return { accepted: true, reason: null };
}

module.exports = matchJoin;
