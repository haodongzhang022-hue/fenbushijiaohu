'use strict';
/**
 * relay-mesh 测试信号灯（M2a 中继网格+容错）
 *
 * 覆盖 06-进度对齐 M2a「志愿者中继/多路径/健康检测/故障切换」：
 *   1. health   —— 心跳窗口可用率
 *   2. failover —— 不健康节点切换备份
 *   3. mesh     —— 志愿者中继发现
 *   4. multipath—— 多路径分片重组
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { HealthMonitor, FailoverManager, RelayMesh, Multipath } = require('../index');

// ---------- 1. health（健康检测） ----------
test('health: 可用率按窗口内成功心跳占比计算', () => {
  const h = new HealthMonitor({ window: 5, threshold: 0.7 });
  h.record('n1', true);
  h.record('n1', true);
  h.record('n1', true);
  h.record('n1', false);
  assert.equal(h.availability('n1'), 0.75);
  assert.equal(h.isHealthy('n1'), true); // 0.75 >= 0.7
});

test('health: 低可用率判定为不健康', () => {
  const h = new HealthMonitor({ window: 4, threshold: 0.7 });
  h.record('n1', true);
  h.record('n1', false);
  h.record('n1', false);
  h.record('n1', false);
  assert.equal(h.isHealthy('n1'), false); // 0.25 < 0.7
});

test('health: 窗口只保留最近 N 次心跳', () => {
  const h = new HealthMonitor({ window: 3, threshold: 0.7 });
  for (let i = 0; i < 5; i++) h.record('n1', true); // 全部成功
  assert.equal(h.availability('n1'), 1);
});

// ---------- 2. failover（故障切换） ----------
test('failover: 健康节点不触发切换', () => {
  const h = new HealthMonitor({ threshold: 0.7 });
  h.record('node-a', true);
  const f = new FailoverManager(h);
  f.register('node-a', 'backup-a');
  assert.equal(f.switchIfNeeded('node-a'), null);
});

test('failover: 不健康节点切换至备份', () => {
  const h = new HealthMonitor({ threshold: 0.7 });
  h.record('node-a', false);
  const f = new FailoverManager(h);
  f.register('node-a', 'backup-a');
  assert.equal(f.switchIfNeeded('node-a'), 'backup-a');
});

// ---------- 3. mesh（中继网格） ----------
test('mesh: 志愿者中继可被发现', () => {
  const mesh = new RelayMesh();
  mesh.offer('relay-1', 5);
  const relay = mesh.findRelay('peer-b');
  assert.ok(relay);
  assert.equal(relay.id, 'relay-1');
});

test('mesh: 不健康中继不被选中', () => {
  const mesh = new RelayMesh();
  mesh.offer('relay-1', 5);
  mesh.setHealth('relay-1', false);
  assert.equal(mesh.findRelay('peer-b'), null);
});

test('mesh: 容量耗尽后不再分配', () => {
  const mesh = new RelayMesh();
  mesh.offer('relay-1', 1);
  assert.ok(mesh.findRelay('a'));
  assert.equal(mesh.findRelay('b'), null); // 容量已占用
});

// ---------- 4. multipath（多路径） ----------
test('multipath: 乱序分片可重组完整内容', () => {
  const mp = new Multipath();
  mp.ingest([{ seq: 2, data: 'c' }, { seq: 0, data: 'a' }]);
  assert.equal(mp.isComplete(3), false);
  mp.ingest([{ seq: 1, data: 'b' }]);
  assert.equal(mp.isComplete(3), true);
  assert.equal(mp.reassemble(3), 'abc');
});

test('multipath: 分片未收齐时重组抛错', () => {
  const mp = new Multipath();
  mp.ingest([{ seq: 0, data: 'a' }]);
  assert.throws(() => mp.reassemble(3), /未收齐/);
});
