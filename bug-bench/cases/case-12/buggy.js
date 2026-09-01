'use strict';
/**
 * case-12 · 游戏大厅匹配延迟预算校验（M5）
 *
 * bug 描述：游戏大厅匹配时，缺少对玩家延迟的严格校验。
 * 当玩家延迟超过预算时仍被允许匹配，导致游戏体验恶化。
 *
 * 正确行为：
 *   - 玩家延迟必须 <= latencyBudgetMs 才能参与匹配
 *   - 超预算玩家返回 notMatched
 *   - 匹配成功时返回 match 信息
 *
 * 输入：(players = [{ id, latency }], latencyBudgetMs)
 * 输出：{ matched: boolean, reason: string|null, matchedPlayers: Array }
 */
function matchPlayers(players, latencyBudgetMs) {
  if (!Array.isArray(players) || players.length < 2) {
    return { matched: false, reason: '玩家不足', matchedPlayers: [] };
  }
  // 校验延迟
  for (const p of players) {
    if (p.latency > latencyBudgetMs) {
      // 修复：超预算玩家不能参与匹配
      return { matched: false, reason: `玩家 ${p.id} 延迟超预算`, matchedPlayers: [] };
    }
  }
  return { matched: true, reason: null, matchedPlayers: players };
}

module.exports = matchPlayers;
