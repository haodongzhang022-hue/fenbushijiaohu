'use strict';
/**
 * transport 模块 —— NetMesh（多节点真实 TCP 回环 mesh 演练）
 *
 * 定位：把「NetTransport 单点直连」推进到「多节点全互联 mesh」——
 * 在 CI/单机即可通过**真实 TCP 回环套接字**演练多节点 mesh 通信，验证：
 *   - 多节点两两经真实 socket 建连（真实网络收发）
 *   - 任意节点可向 mesh 内任一节点发消息（点对点/广播）
 *   - 节点加入/掉线时 mesh 拓扑动态感知（join/leave 自动发现）
 *
 * 对齐 16 号文档 §5.3 NetTransport 过渡阶梯 + 06 进度 P0 真实网络：
 *   NetTransport（单点直连）→ NetMesh（多节点全互联）→ 最终 WebRTC/libp2p 真网。
 *
 * 不引入跨包依赖：仅使用 core 内部已就绪的 NetTransport + 共享地址注册表。
 */

const { NetTransport } = require('./net');

/**
 * NetMesh —— 多节点真实 TCP 回环 mesh
 *
 * 设计要点：
 *   1. 共享 registry 作为节点地址簿（nodeId → {host, port}）；
 *   2. 每节点一个 NetTransport（独立真实回环监听）；
 *   3. addNode 自动与新节点建立全互联；
 *   4. removeNode 关闭其传输并从 mesh 移除（其余节点自动感知断开）；
 *   5. broadcast/sendTo 经真实 TCP 套接字端到端收发。
 */
class NetMesh {
  /**
   * @param {object} [opts]
   * @param {object} [opts.registry] 可注入的共享地址簿（默认内部创建）
   */
  constructor(opts = {}) {
    this._registry = opts.registry || {};
    this._transports = new Map();           // nodeId -> NetTransport
    this._dataHandlers = new Map();         // nodeId -> cb(data, from)
  }

  /** 当前在线节点 id 列表 */
  get nodeIds() {
    return [...this._transports.keys()];
  }

  /** mesh 节点数量 */
  get size() {
    return this._transports.size;
  }

  /** mesh 是否包含指定节点 */
  has(nodeId) {
    return this._transports.has(nodeId);
  }

  /**
   * 添加一个节点到 mesh（自动建立与已有节点的真实 TCP 连接）
   * @param {string} nodeId
   * @returns {Promise<{id:string, port:number}>}
   */
  async addNode(nodeId) {
    if (this._transports.has(nodeId)) {
      throw new Error(`节点 ${nodeId} 已存在于 mesh`);
    }
    const t = new NetTransport(nodeId, { registry: this._registry });
    await this._whenReady(t);
    this._transports.set(nodeId, t);
    // 注册数据回调
    const handler = this._dataHandlers.get(nodeId);
    if (handler) t.onData(handler);

    // 与已有节点全互联（新建方作为主动拨号方）
    for (const existingId of this._transports.keys()) {
      if (existingId === nodeId) continue;
      // 新建节点主动连接已有节点
      try {
        await t.connect({ id: existingId }, this._registry);
      } catch (e) {
        // 连接失败仅记录不阻塞 mesh 加入
        this._registry[nodeId] = { host: t.host, port: t.port };
      }
    }
    // 确保双方握手登记完成
    await this._settle();
    return { id: nodeId, port: t.port };
  }

  /**
   * 移除一个节点（关闭传输，mesh 其余节点自动感知其不可达）
   * @param {string} nodeId
   */
  removeNode(nodeId) {
    const t = this._transports.get(nodeId);
    if (!t) return;
    t.close();
    this._transports.delete(nodeId);
    delete this._registry[nodeId];
    this._dataHandlers.delete(nodeId);
  }

  /**
   * 从 nodeId 发送消息到 targetId（经真实 TCP 回环）
   * @param {string} nodeId 发送方
   * @param {string} targetId 目标
   * @param {object} msg 载荷
   * @returns {Promise<boolean>}
   */
  async sendTo(nodeId, targetId, msg) {
    if (nodeId === targetId) return false; // 自发送防护
    const t = this._transports.get(nodeId);
    if (!t) throw new Error(`节点 ${nodeId} 不在 mesh 中`);
    const target = this._transports.get(targetId);
    if (!target) throw new Error(`目标 ${targetId} 不在 mesh 中`);
    const frame = {
      from: nodeId,
      to: targetId,
      kind: msg.kind || 'data',
      payload: msg.payload !== undefined ? msg.payload : msg,
      ts: Date.now(),
    };
    return t.send(targetId, frame);
  }

  /**
   * 从 nodeId 广播到 mesh 内所有其它节点
   * @param {string} nodeId
   * @param {object} msg
   * @returns {Promise<number>} 成功投递数
   */
  async broadcast(nodeId, msg) {
    let ok = 0;
    for (const targetId of this.nodeIds) {
      if (targetId === nodeId) continue;
      try {
        const sent = await this.sendTo(nodeId, targetId, msg);
        if (sent) ok += 1;
      } catch (e) { /* 单点失败不影响广播 */ }
    }
    return ok;
  }

  /**
   * 注册某节点的数据到达回调
   * @param {string} nodeId
   * @param {(data: object, from: string) => void} cb
   */
  onData(nodeId, cb) {
    this._dataHandlers.set(nodeId, cb);
    const t = this._transports.get(nodeId);
    if (t) t.onData(cb);
  }

  /**
   * 获取当前 mesh 拓扑
   * @returns {Array<{id:string, port:number, peers:string[]}>}
   */
  getTopology() {
    return [...this._transports.entries()].map(([id, t]) => ({
      id,
      port: t.port,
      peers: [...t.peers],
    }));
  }

  /**
   * 关闭整个 mesh：释放所有连接与资源
   */
  close() {
    for (const t of this._transports.values()) {
      try { t.close(); } catch (e) { /* ignore */ }
    }
    this._transports.clear();
    this._dataHandlers.clear();
    this._registry = {};
  }

  /** 等待某 transport 完成监听 */
  async _whenReady(t) {
    for (let i = 0; i < 100; i++) {
      if (t.port > 0 && t.isNetworkReady) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`NetTransport ${t.nodeId} 监听超时`);
  }

  /** 等待各方握手完成（网络编排稳定） */
  async _settle() {
    await new Promise((r) => setTimeout(r, 120));
  }
}

module.exports = { NetMesh };
