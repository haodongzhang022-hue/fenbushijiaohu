'use strict';
/**
 * net-policy 测试信号灯（M2 联网策略）
 *
 * 覆盖 06-进度对齐 M2「在线/局域网/离线切换 + NAT 兜底」：
 *   1. policy —— 联网模式切换 + 中继判断 + 首选路径
 *   2. relay  —— NAT 失败经中继兜底转发
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Policy, RelayClient } = require('../index');

// ---------- 1. policy（联网策略 + NAT 兜底） ----------
test('policy: online + NAT 失败 → 走中继 relay', () => {
  const p = new Policy('online', true);
  assert.equal(p.canBroadcast(), true);
  assert.equal(p.canReceive(), true);
  assert.equal(p.shouldUseRelay(), true);
  assert.equal(p.preferredPath(), 'relay');
});

test('policy: online + NAT 成功 → 直连 direct', () => {
  const p = new Policy('online', false);
  assert.equal(p.shouldUseRelay(), false);
  assert.equal(p.preferredPath(), 'direct');
});

test('policy: lan → 局域网内直连且可广播', () => {
  const p = new Policy('lan', true); // NAT 失败不强制中继
  assert.equal(p.canBroadcast(), true);
  assert.equal(p.preferredPath(), 'direct');
});

test('policy: offline → 本地回环 local，不可广播', () => {
  const p = new Policy('offline', true);
  assert.equal(p.canBroadcast(), false);
  assert.equal(p.canReceive(), true);
  assert.equal(p.shouldUseRelay(), false);
  assert.equal(p.preferredPath(), 'local');
});

test('policy: 非法模式抛错', () => {
  const p = new Policy('online');
  assert.throws(() => p.setMode('unknown'), /非法联网模式/);
});

test('policy P2-01: 构造器校验非法模式，与 setMode 对齐', () => {
  assert.throws(() => new Policy('hacker-mode'), /非法联网模式/);
  assert.throws(() => new Policy('illegal'), /非法联网模式/);
  // 合法模式不受影响
  assert.doesNotThrow(() => new Policy('online'));
  assert.doesNotThrow(() => new Policy('lan'));
  assert.doesNotThrow(() => new Policy('offline'));
});

// ---------- 2. relay（NAT 兜底转发） ----------
test('relay: NAT 失败经中继兜底转发成功', async () => {
  const mesh = { findRelay: (targetId) => ({ id: `relay-${targetId}`, addr: '127.0.0.1:9000', cost: 1 }) };
  const relay = new RelayClient(mesh);
  const desc = await relay.requestRelay('peer-b');
  assert.equal(desc.path, 'relay');
  assert.equal(desc.id, 'relay-peer-b');
  const res = await relay.forwardVia(desc, { id: 'm1', payload: 'hi' });
  assert.equal(res.delivered, true);
  assert.equal(res.via, 'relay-peer-b');
  assert.ok(res.bytes > 0);
});

test('relay: 无可用中继时抛错', async () => {
  const relay = new RelayClient({ findRelay: () => null });
  await assert.rejects(() => relay.requestRelay('peer-x'), /无可用中继节点/);
});

test('relay: 同目标复用已建立的中继链路', async () => {
  let calls = 0;
  const mesh = { findRelay: () => { calls += 1; return { id: 'relay-a', cost: 1 }; } };
  const relay = new RelayClient(mesh);
  await relay.requestRelay('peer-a');
  await relay.requestRelay('peer-a');
  assert.equal(calls, 1); // 复用，不再向网格重复申请
});
