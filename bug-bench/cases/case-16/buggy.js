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
  // 容量校验：房间已满（playerCount >= capacity）则拒绝加入
  const capacity = typeof room.capacity === 'number' ? room.capacity : Infinity;
  if (room.playerCount >= capacity) {
    return { accepted: false, reason: '房间已满' };
  }
  // 延迟校验
  if (player.latency > latencyBudget) {
    return { accepted: false, reason: '延迟超预算' };
  }
  return { accepted: true, reason: null };
}

module.exports = matchJoin;
