'use strict';
/**
 * relay 模块 —— NAT 中继兜底（M2）
 *
 * 对齐 09-审查补充与增强 §3 中转加速：NAT 穿透失败时，经志愿者中继转发。
 * 中继只转发不落盘（防中继窃取内容），按转发流量计贡献。
 *
 *   interface RelayClient {
 *     requestRelay(targetId): Promise<RelayDesc>;  // 向中继网格请求一条转发链路
 *     forwardVia(relay, payload): Promise<boolean>; // 经中继转发一条消息
 *   }
 */
class RelayClient {
  /**
   * @param {object} mesh 中继网格（提供 findRelay 能力，见 M2a relay-mesh）
   */
  constructor(mesh = { findRelay: () => null }) {
    this.mesh = mesh;
    this._activeRelays = new Map(); // targetId -> relayDesc
  }

  /**
   * 为对端请求一条中继链路
   * @param {string} targetId
   */
  async requestRelay(targetId) {
    if (this._activeRelays.has(targetId)) {
      return this._activeRelays.get(targetId);
    }
    const relay = this.mesh.findRelay && this.mesh.findRelay(targetId);
    if (!relay) {
      throw new Error('无可用中继节点');
    }
    // 中继描述：{ id, addr, path: 'relay', cost }
    const desc = { ...relay, path: 'relay', createdAt: Date.now() };
    this._activeRelays.set(targetId, desc);
    return desc;
  }

  /**
   * 经中继转发一条消息（只转发不落盘）
   * @param {{id:string, to:string}} relay 中继描述
   * @param {object} msg 待转发消息
   */
  async forwardVia(relay, msg) {
    if (!relay || !relay.id) throw new Error('非法中继描述');
    // 模拟经中继投递（转发流量计入贡献量，由上层结算信誉分）
    return { delivered: true, via: relay.id, bytes: JSON.stringify(msg).length };
  }
}

module.exports = { RelayClient };
