'use strict';
/**
 * app 测试 —— M5 游戏大厅 + 联邦协议
 *
 * 覆盖 16 号文档 §3 M5 游戏大厅（Lobby + Fed）：
 *   - Lobby: join/match/leave/getLatencyBudget/onMatch
 *   - Fed: init/emit/subscribe/mapPlatformEvent/reconnect
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Lobby, PLAYER_STATES, Fed, EVENT_TYPES, FED_PROTOCOL_VERSION } = require('../index');

// ---------- 1. Lobby 游戏大厅 ----------
test('lobby: 加入大厅并连接', async () => {
  const lobby = new Lobby();
  const result = await lobby.join('room-1', { id: 'player-a', gameType: 'fps', latency: 30 });
  assert.equal(result.roomId, 'room-1');
  assert.equal(result.playerId, 'player-a');
  assert.equal(result.state, PLAYER_STATES.CONNECTED);
  assert.equal(lobby.playerCount, 1);
});

test('lobby: 两玩家可匹配', async () => {
  const lobby = new Lobby({ latencyBudgetMs: 100 });
  await lobby.join('room-1', { id: 'player-a', latency: 20 });
  await lobby.join('room-1', { id: 'player-b', latency: 30 });
  const matches = await lobby.match('room-1');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].pair.length, 2);
  assert.ok(matches[0].latency <= 100);
});

test('lobby: 匹配回调触发', async () => {
  const lobby = new Lobby();
  let matchNotified = null;
  lobby.onMatch('room-1', (match) => { matchNotified = match; });
  await lobby.join('room-1', { id: 'player-a', latency: 10 });
  await lobby.join('room-1', { id: 'player-b', latency: 15 });
  await lobby.match('room-1');
  assert.ok(matchNotified);
  assert.equal(matchNotified.pair.length, 2);
});

test('lobby: 房间满员拒绝', async () => {
  const lobby = new Lobby({ maxPlayersPerRoom: 2 });
  await lobby.join('room-1', { id: 'p1' });
  await lobby.join('room-1', { id: 'p2' });
  await assert.rejects(() => lobby.join('room-1', { id: 'p3' }), /已满/);
});

test('lobby: 离开大厅清除玩家', async () => {
  const lobby = new Lobby();
  await lobby.join('room-1', { id: 'player-a' });
  assert.equal(lobby.playerCount, 1);
  await lobby.leave('room-1');
  assert.equal(lobby.playerCount, 0);
  assert.equal(lobby.roomCount, 0);
});

test('lobby: 延迟预算校验', async () => {
  const lobby = new Lobby({ latencyBudgetMs: 50 });
  await lobby.join('room-1', { id: 'player-a', latency: 100 });
  const budget = lobby.getLatencyBudget('room-1');
  assert.ok(budget >= 100);
  // 超出预算时匹配抛错
  await lobby.join('room-1', { id: 'player-b', latency: 120 });
  await assert.rejects(() => lobby.match('room-1'), /延迟超预算/);
});

// ---------- 2. Fed 联邦协议 ----------
test('fed: 初始化并注册主题', async () => {
  const fed = new Fed({ nodeId: 'fed-node-1' });
  const result = await fed.init(['lobby-1', 'lobby-2']);
  assert.equal(result.topics.length, 2);
  assert.equal(fed.state, 'streaming');
});

test('fed: 发布/订阅统一事件', async () => {
  const fed = new Fed();
  await fed.init(['lobby-1']);
  const received = [];
  fed.subscribe('lobby-1', (event) => received.push(event));
  const emitted = await fed.emit({
    type: 'player-join',
    topic: 'lobby-1',
    data: { playerId: 'player-x' },
  });
  assert.equal(emitted.type, 'player-join');
  assert.equal(emitted.proto, FED_PROTOCOL_VERSION);
  assert.equal(received.length, 1);
  assert.equal(received[0].data.playerId, 'player-x');
});

test('fed: 非法事件类型拒绝', async () => {
  const fed = new Fed();
  await assert.rejects(() => fed.emit({ type: 'hack', topic: 'x', data: {} }), /非法事件类型/);
});

test('fed: 平台事件映射到统一事件', () => {
  const fed = new Fed();
  const mapped = fed.mapPlatformEvent({ userId: 'steam-123', lobbyId: 'lobby-a' }, 'steam');
  assert.equal(mapped.type, 'player-join');
  assert.equal(mapped.topic, 'lobby-a');
  assert.equal(mapped.data.platform, 'steam');
  assert.equal(mapped.data.playerId, 'steam-123');
});

test('fed: 断线重连', async () => {
  const fed = new Fed();
  await fed.init(['topic-1']);
  const result = await fed.reconnect();
  assert.equal(result.reconnected, true);
  assert.equal(result.topics.length, 1);
  assert.equal(fed.state, 'streaming');
});

test('fed: 事件日志可审计', async () => {
  const fed = new Fed();
  await fed.init(['t1']);
  await fed.emit({ type: 'chat', topic: 't1', data: { msg: 'hello' } });
  const log = fed.eventLog;
  assert.equal(log.length, 1);
  assert.equal(log[0].type, 'chat');
});
