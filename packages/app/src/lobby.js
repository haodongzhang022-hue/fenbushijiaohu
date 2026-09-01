'use strict';
/**
 * lobby 模块 —— 游戏大厅（M5）
 *
 * 对齐 16 号文档 §3.2 M5-A `lobby.js` 游戏大厅：
 *   职责：游戏/用户意图 → 匹配 → 低延迟连线编排
 *   输入：join(room, profile) / match(players)
 *   输出：Room / MatchResult(peers, signaling)
 *   依赖：signal、fed、identity、transport
 *   风险：[MEDIUM] 匹配延迟、房间容量、作弊注入
 *   状态机：idle→joining→matching→connected→playing→left
 *
 * 实现要点：
 *   - 大厅管理多个房间（roomId）
 *   - 玩家可 join/leave
 *   - 触发 match 时根据延迟预算进行配对
 *   - 支持 onMatch 回调通知
 */

const crypto = require('crypto');

// 玩家状态机
const PLAYER_STATES = {
  IDLE: 'idle',
  JOINING: 'joining',
  MATCHING: 'matching',
  CONNECTED: 'connected',
  PLAYING: 'playing',
  LEFT: 'left',
};

class Lobby {
  /**
   * @param {object} [opts]
   * @param {number} [opts.latencyBudgetMs] 默认延迟预算 ms
   * @param {number} [opts.maxPlayersPerRoom] 每房间最大人数
   */
  constructor(opts = {}) {
    this._rooms = new Map();        // roomId -> { players: Map<playerId, profile>, state }
    this._players = new Map();      // playerId -> { roomId, profile, state, latency }
    this._matchCbs = new Map();     // roomId -> callback
    this.latencyBudgetMs = opts.latencyBudgetMs || 100;
    this.maxPlayersPerRoom = opts.maxPlayersPerRoom || 8;
  }

  /**
   * 进入大厅
   * @param {string} roomId 房间 id
   * @param {object} profile 玩家资料 { id, gameType, region, latency? }
   * @returns {{roomId:string, playerId:string, state:string}}
   */
  async join(roomId, profile) {
    if (!roomId || !profile || !profile.id) {
      throw new Error('非法入厅参数：需 roomId + profile.id');
    }
    if (!this._rooms.has(roomId)) {
      this._rooms.set(roomId, {
        id: roomId,
        players: new Map(),
        state: 'open',
        createdAt: Date.now(),
      });
    }
    const room = this._rooms.get(roomId);
    if (room.players.size >= this.maxPlayersPerRoom) {
      throw new Error(`房间 ${roomId} 已满`);
    }
    // 记录玩家
    const player = {
      id: profile.id,
      roomId,
      profile,
      state: PLAYER_STATES.JOINING,
      latency: profile.latency || 0,
      joinedAt: Date.now(),
    };
    room.players.set(profile.id, player);
    this._players.set(profile.id, player);
    player.state = PLAYER_STATES.CONNECTED;
    return { roomId, playerId: profile.id, state: player.state };
  }

  /**
   * 触发匹配（房间内自动配对）
   * @param {string} roomId
   * @returns {Array<{pair:Array<string>, latency:number}>} 匹配结果
   */
  async match(roomId) {
    const room = this._rooms.get(roomId);
    if (!room) throw new Error(`房间 ${roomId} 不存在`);
    if (room.players.size < 2) return [];

    // 按延迟分组配对（简单策略：按延迟相近配对）
    const players = [...room.players.values()]
      .filter((p) => p.state === PLAYER_STATES.CONNECTED)
      .sort((a, b) => a.latency - b.latency);

    const matches = [];
    for (let i = 0; i + 1 < players.length; i += 2) {
      const a = players[i];
      const b = players[i + 1];
      const latency = Math.max(a.latency, b.latency);
      // 延迟预算校验
      if (latency > this.latencyBudgetMs) {
        throw new Error(`配对延迟超预算: ${latency}ms > ${this.latencyBudgetMs}ms`);
      }
      a.state = PLAYER_STATES.PLAYING;
      b.state = PLAYER_STATES.PLAYING;
      const matchResult = { pair: [a.id, b.id], latency };
      matches.push(matchResult);
      // 通知回调
      const cb = this._matchCbs.get(roomId);
      if (cb) cb(matchResult);
    }
    return matches;
  }

  /**
   * 注册匹配结果回调
   * @param {string} roomId
   * @param {(match: object) => void} cb
   */
  onMatch(roomId, cb) {
    this._matchCbs.set(roomId, cb);
  }

  /**
   * 离开大厅
   * @param {string} roomId
   */
  async leave(roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return;
    for (const [playerId, player] of room.players) {
      player.state = PLAYER_STATES.LEFT;
      this._players.delete(playerId);
    }
    this._rooms.delete(roomId);
  }

  /**
   * 获取房间延迟预算（校验是否满足低延迟约束）
   * @param {string} roomId
   */
  getLatencyBudget(roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return 0;
    // 当前房间内最大玩家延迟
    let maxLatency = 0;
    for (const p of room.players.values()) {
      maxLatency = Math.max(maxLatency, p.latency);
    }
    return maxLatency;
  }

  /** 当前活跃房间数 */
  get roomCount() {
    return this._rooms.size;
  }

  /** 当前在线玩家数 */
  get playerCount() {
    return this._players.size;
  }
}

module.exports = { Lobby, PLAYER_STATES };
