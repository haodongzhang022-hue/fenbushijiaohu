'use strict';
/**
 * policy 模块 —— 联网策略（M1 最小实现）
 *
 * 架构师接口契约（04 §3.4）：
 *   interface Policy {
 *     mode: 'online' | 'lan' | 'offline';
 *     canBroadcast(): boolean;
 *     canReceive(): boolean;
 *     shouldUseRelay(): boolean; // NAT 穿透失败时
 *   }
 *
 * 规则（取自 02 顶层架构拓扑 + 03 可行性验证的联网策略）：
 *   - online : 可广播、可接收、NAT 失败走中继
 *   - lan    : 可广播、可接收（局域网内）、通常不需中继
 *   - offline: 仅本地，不可广播、可接收本机回环、走本地兜底
 */
const VALID_MODES = ['online', 'lan', 'offline'];

class Policy {
  /**
   * @param {'online'|'lan'|'offline'} [mode] 初始联网模式
   * @param {boolean} [natFailed] 本次会话 NAT 是否穿透失败
   */
  constructor(mode = 'online', natFailed = false) {
    // P2-01：构造器与 setMode 校验行为对齐，非法模式直接抛错
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`非法联网模式: ${mode}`);
    }
    this.mode = mode;
    this.natFailed = natFailed;
  }

  /** 是否允许对外广播（发布自己的消息/能力） */
  canBroadcast() {
    return this.mode !== 'offline';
  }

  /** 是否允许接收外部消息 */
  canReceive() {
    return true; // 三个模式均允许接收（offline 至少可收本机回环）
  }

  /** 是否应使用中继：NAT 穿透失败且处于联网态时 */
  shouldUseRelay() {
    if (this.mode === 'offline') return false;
    return this.natFailed;
  }

  /** 切换模式 */
  setMode(mode) {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`非法联网模式: ${mode}`);
    }
    this.mode = mode;
  }
}

module.exports = { Policy };
