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
    // BUG: 条件写反 —— offline 时本应 false，却返回 true
    canBroadcast: mode !== 'offline' ? false : true,
    canReceive: true,
    // BUG: offline 本应 false，这里返回 true
    shouldUseRelay: mode === 'offline' ? true : natFailed,
  };
}

module.exports = buggyPolicy;
