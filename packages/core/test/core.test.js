'use strict';
/**
 * core 测试信号灯（M1 最小可测断言）
 *
 * 覆盖架构师接口契约（04 §3）四层核心能力：
 *   1. identity —— 签名可验、防篡改
 *   2. policy   —— 联网策略开关
 *   3. session  —— 消息条 + CRDT 收敛（Lamport + LWW）
 *   4. transport—— 内存直连收发
 *
 * 本文件作为"测试信号灯"，任何修改核心代码的行为（含 bug 修复）都必须
 * 通过本组断言，否则视为回归/未修复（CI 红灯阻塞）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Identity, Policy, Session, MSG_TYPES, MemoryTransport } = require('../index');

// ---------- 1. identity ----------
test('identity: 签名可被本密钥验签通过', () => {
  const id = new Identity();
  const sig = id.sign('hello');
  assert.equal(id.verify(id.publicKey, 'hello', sig), true);
});

test('identity: 篡改消息后验签失败', () => {
  const id = new Identity();
  const sig = id.sign('hello');
  assert.equal(id.verify(id.publicKey, 'hellx', sig), false);
});

test('identity: 用他人公钥验签失败', () => {
  const alice = new Identity();
  const bob = new Identity();
  const sig = alice.sign('hello');
  assert.equal(bob.verify(bob.publicKey, 'hello', sig), false);
});

// ---------- 2. policy ----------
test('policy: online 可广播，NAT 失败走中继', () => {
  const p = new Policy('online', true);
  assert.equal(p.canBroadcast(), true);
  assert.equal(p.canReceive(), true);
  assert.equal(p.shouldUseRelay(), true);
});

test('policy: offline 不可广播且不走中继', () => {
  const p = new Policy('offline', true);
  assert.equal(p.canBroadcast(), false);
  assert.equal(p.canReceive(), true);
  assert.equal(p.shouldUseRelay(), false);
});

test('policy: 非法模式抛错', () => {
  const p = new Policy('online');
  assert.throws(() => p.setMode('unknown'), /非法联网模式/);
});

// ---------- 3. session（消息条 + CRDT 收敛） ----------
test('session: 发送消息生成合法消息且可被读回', () => {
  const s = new Session('pub-a', 'chan-1');
  const msg = s.send('你好', 'text');
  assert.equal(msg.sender, 'pub-a');
  assert.equal(msg.channelId, 'chan-1');
  assert.ok(MSG_TYPES.includes(msg.type));
  assert.ok(msg.id.length > 0);
  assert.equal(s.messages.length, 1);
});

test('session: 两条节点并发消息通过 Lamport+LWW 收敛为同一序列', () => {
  const a = new Session('pub-a', 'chan-x');
  const b = new Session('pub-b', 'chan-x');
  // 并发发送：a 发 ts=1，b 发 ts=1（各自本地时钟独立）
  const ma = a.send('from-a');
  const mb = b.send('from-b');
  // 相互合并
  a.merge(mb);
  b.merge(ma);
  // 两边应收敛到同样两条消息，且顺序一致
  assert.equal(a.messages.length, 2);
  assert.equal(b.messages.length, 2);
  const keyA = a.messages.map((m) => m.id).join(',');
  const keyB = b.messages.map((m) => m.id).join(',');
  assert.equal(keyA, keyB);
});

test('session: 重复合并同一条消息幂等', () => {
  const a = new Session('pub-a', 'chan-1');
  const msg = a.send('hi');
  assert.equal(a.merge(msg), false); // 同键同 ts 已存在，不重复落地
  assert.equal(a.messages.length, 1);
});

test('session: 非法消息类型被拒绝', () => {
  const s = new Session('pub-a', 'chan-1');
  assert.throws(() => s.send('x', 'hack'), /非法消息类型/);
  // merge 非法类型返回 false 而非抛出
  assert.equal(s.merge({ channelId: 'chan-1', type: 'hack', ts: 1 }), false);
});

// ---------- 4. transport（内存直连） ----------
test('transport: 两节点直连收发消息闭环', async () => {
  const ta = new MemoryTransport('node-a');
  const tb = new MemoryTransport('node-b');
  const received = [];
  tb.listen((msg) => received.push(msg));
  await ta.connect({ id: 'node-b' });
  const ok = ta.send({ id: 'm1', payload: 'ping' }, tb);
  assert.equal(ok, true);
  assert.equal(received.length, 1);
  assert.equal(received[0].payload, 'ping');
});
