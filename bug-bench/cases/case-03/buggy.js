'use strict';
/**
 * case-03 · policy 联网策略判断反了（注入 bug）
 *
 * bug 描述：offline 模式下 shouldUseRelay() 被错误地返回 true
 * （离线本应禁止中继），且 canBroadcast() 在 offline 下错误返回 true
 * （离线本应禁止广播）。
 *
 * 正确行为：
 *   - offline：canBroadcast()=false，shouldUseRelay()=false
 *   - online：canBroadcast()=true，NAT 失败时 shouldUseRelay()=true
 *
 * 输入：({ mode, natFailed })
 * 输出：{ canBroadcast, canReceive, shouldUseRelay }
 */
function buggyPolicy(cfg) {
  const mode = cfg.mode;
  const natFailed = cfg.natFailed;
  return {
    // 修复：offline 时禁止广播，online 时可广播
    canBroadcast: mode === 'offline' ? false : true,
    canReceive: true,
    // 修复：offline 禁止中继，online 且 NAT 失败时才走中继
    shouldUseRelay: mode === 'offline' ? false : natFailed,
  };
}

module.exports = buggyPolicy;
