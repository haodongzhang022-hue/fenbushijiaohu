'use strict';
/**
 * policy 模块 —— 联网策略（M2 增强版）
 *
 * 在 M1 policy 基础上，对齐 06-进度对齐 M2「联网策略：在线/局域网/离线切换 + NAT 兜底」：
 *   interface Policy {
 *     mode: 'online' | 'lan' | 'offline';
 *     natFailed: boolean;              // NAT 穿透是否失败
 *     canBroadcast(): boolean;
 *     canReceive(): boolean;
 *     shouldUseRelay(): boolean;       // NAT 失败且非离线时走中继
 *     preferredPath(): 'direct'|'relay'|'local';
 *   }
 *
 * 规则：
 *   - online : 可广播、可接收；NAT 失败走中继（relay），成功走直连（direct）
 *   - lan    : 可广播、可接收（局域网内优先直连）
 *   - offline: 仅本地回环（local），不可广播
 */
class Policy {
  /**
   * @param {'online'|'lan'|'offline'} [mode]
   * @param {boolean} [natFailed]
   */
  constructor(mode = 'online', natFailed = false) {
    this.mode = mode;
    this.natFailed = natFailed;
  }

  /** 是否允许对外广播（发布自己的消息/能力） */
  canBroadcast() {
    return this.mode !== 'offline';
  }

  /** 是否允许接收外部消息 */
  canReceive() {
    return true;
  }

  /** 是否应使用中继：NAT 穿透失败且处于联网态时 */
  shouldUseRelay() {
    if (this.mode === 'offline') return false;
    return this.natFailed;
  }

  /** 首选路径：offline→local；online 且 NAT 失败→relay；否则→direct */
  preferredPath() {
    if (this.mode === 'offline') return 'local';
    if (this.mode === 'online' && this.natFailed) return 'relay';
    return 'direct';
  }

  /** 切换模式 */
  setMode(mode) {
    if (!['online', 'lan', 'offline'].includes(mode)) {
      throw new Error(`非法联网模式: ${mode}`);
    }
    this.mode = mode;
  }
}

module.exports = { Policy };
