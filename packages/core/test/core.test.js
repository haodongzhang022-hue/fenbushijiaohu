'use strict';
/**
 * core 测试信号灯（M1 最小可测断言 + P0 真实传输 + P1 Keystore）
 *
 * 覆盖架构师接口契约（04 §3）四层核心能力：
 *   1. identity —— 签名可验、防篡改
 *   2. keystore —— 加密持久化 + 口令解锁
 *   3. policy   —— 联网策略开关
 *   4. session  —— 消息条 + CRDT 收敛（Lamport + LWW）
 *   5. transport—— 内存直连收发 + WebRTC/libp2p 适配器
 *
 * 本文件作为"测试信号灯"，任何修改核心代码的行为（含 bug 修复）都必须
 * 通过本组断言，否则视为回归/未修复（CI 红灯阻塞）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Identity,
  Keystore,
  Policy,
  Session,
  MSG_TYPES,
  MemoryTransport,
  WebRTCTransport,
  Libp2pTransport,
  Transport,
  createTransport,
} = require('../index');

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

test('identity: P2-02 sign 非字符串入参优雅抛自定义类型错误', () => {
  const id = new Identity();
  assert.throws(() => id.sign(123), /入参必须为字符串/);
  assert.throws(() => id.sign(null), /入参必须为字符串/);
  assert.throws(() => id.sign({ a: 1 }), /入参必须为字符串/);
  assert.throws(() => id.sign(undefined), /入参必须为字符串/);
  // 字符串入参正常
  assert.doesNotThrow(() => id.sign('ok'));
});

// ---------- 1b. keystore（P1 身份凭据持久化） ----------
test('keystore: 生成+解锁+签名闭环', async () => {
  const ks = new Keystore();
  const { keyId, publicKey } = await ks.generate('test-pass-123');
  assert.ok(keyId.length > 0);
  assert.ok(publicKey.length > 0);
  assert.equal(ks.state, 'locked');

  // 解锁
  const unlocked = await ks.unlock(keyId, 'test-pass-123');
  assert.equal(unlocked.keyId, keyId);
  assert.equal(ks.isUnlocked, true);

  // 签名+验证
  const sig = ks.sign('hello-keystore');
  assert.equal(ks.verify(publicKey, 'hello-keystore', sig), true);
});

test('keystore: 错误口令无法解锁', async () => {
  const ks = new Keystore();
  const { keyId } = await ks.generate('correct-pass');
  await assert.rejects(() => ks.unlock(keyId, 'wrong-pass'), /口令错误|密钥损坏/);
});

test('keystore: 锁定后无法签名', async () => {
  const ks = new Keystore();
  const { keyId } = await ks.generate('pass-1234');
  await ks.unlock(keyId, 'pass-1234');
  ks.lock();
  assert.equal(ks.isUnlocked, false);
  assert.throws(() => ks.sign('x'), /未解锁/);
});

test('keystore: 撤销后密钥被删除', async () => {
  const ks = new Keystore();
  const { keyId } = await ks.generate('pass-1234');
  await ks.revoke(keyId);
  assert.equal(ks.listKeys().length, 0);
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

test('policy: P2-01 构造器与 setMode 校验对齐，非法模式抛错', () => {
  assert.throws(() => new Policy('hacker-mode'), /非法联网模式/);
  assert.throws(() => new Policy('unknown'), /非法联网模式/);
  // 合法模式构造不抛错
  assert.doesNotThrow(() => new Policy('online'));
  assert.doesNotThrow(() => new Policy('lan'));
  assert.doesNotThrow(() => new Policy('offline'));
  assert.doesNotThrow(() => new Policy()); // 默认 online
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
  const ma = a.send('from-a');
  const mb = b.send('from-b');
  a.merge(mb);
  b.merge(ma);
  assert.equal(a.messages.length, 2);
  assert.equal(b.messages.length, 2);
  const keyA = a.messages.map((m) => m.id).join(',');
  const keyB = b.messages.map((m) => m.id).join(',');
  assert.equal(keyA, keyB);
});

test('session: 重复合并同一条消息幂等', () => {
  const a = new Session('pub-a', 'chan-1');
  const msg = a.send('hi');
  assert.equal(a.merge(msg), false);
  assert.equal(a.messages.length, 1);
});

test('session: 非法消息类型被拒绝', () => {
  const s = new Session('pub-a', 'chan-1');
  assert.throws(() => s.send('x', 'hack'), /非法消息类型/);
  assert.equal(s.merge({ channelId: 'chan-1', type: 'hack', ts: 1 }), false);
});

test('session: P2-05 merge 缺必需字段的消息被拒绝', () => {
  const s = new Session('pub-a', 'chan-1');
  // 缺 id/ts 的畸形消息
  assert.equal(s.merge({ channelId: 'chan-1', type: 'text', payload: 'x' }), false);
  // 缺 sender
  assert.equal(
    s.merge({ channelId: 'chan-1', type: 'text', payload: 'x', ts: 1, id: 'abc' }),
    false
  );
  // 缺 payload
  assert.equal(
    s.merge({ channelId: 'chan-1', type: 'text', sender: 'pub-b', ts: 1, id: 'abc' }),
    false
  );
  // ts 非数字
  assert.equal(
    s.merge({ channelId: 'chan-1', type: 'text', payload: 'x', sender: 'pub-b', ts: '1', id: 'abc' }),
    false
  );
  // 字段齐全的合法消息可合并
  const good = s.send('合法消息', 'text');
  // 再造一条字段齐全的远端合法消息并验证可合并（构造消息需带 channelId/type/payload/sender/ts/id）
  assert.equal(
    s.merge({ channelId: 'chan-1', type: 'text', payload: 'ok', sender: 'pub-b', ts: 99, id: 'xyz-ok' }),
    true
  );
  // 空视图为空时不应增长畸形消息
  assert.equal(s.messages.length, 2);
});

test('session: P2-03 签名模式 send 自动附带签名，merge 拒绝伪造 sender', () => {
  const alice = new Identity();
  const bob = new Identity();
  // 签名模式会话（alice 身份）
  const a = new Session(alice.publicKey, 'chan-s', { identity: alice });
  const b = new Session(bob.publicKey, 'chan-s', { identity: bob });
  assert.equal(a.signed, true);

  // alice 签名发送，bob 可验签合并
  const ma = a.send('secure-msg');
  assert.ok(ma.sig, '发送的消息应附带签名');
  assert.equal(a.verifySender(ma), true);       // 本地消息验签通过
  assert.equal(b.merge(ma), true);              // bob 可合并合法签名消息

  // 篡改 sender（伪造身份）：把 sender 改成 bob 的公钥但签名仍是 alice 的
  const forged = { ...ma, sender: bob.publicKey };
  assert.equal(b.merge(forged), false, '伪造 sender 应被拒绝');

  // 篡改 payload：内容变了签名对不上
  const tampered = { ...ma, payload: 'tampered' };
  assert.equal(b.merge(tampered), false, '篡改内容应被拒绝');

  // 去掉 sig 的未签名消息应被拒绝
  const noSig = { ...ma };
  delete noSig.sig;
  assert.equal(b.merge(noSig), false, '未签名消息应被拒绝');
});

test('session: P2-03 签名模式两节点经签名收敛一致', () => {
  const alice = new Identity();
  const bob = new Identity();
  const a = new Session(alice.publicKey, 'chan-z', { identity: alice });
  const b = new Session(bob.publicKey, 'chan-z', { identity: bob });
  const ma = a.send('from-alice');
  const mb = b.send('from-bob');
  assert.equal(a.merge(mb), true);   // 交叉验签合并
  assert.equal(b.merge(ma), true);
  assert.equal(a.messages.length, 2);
  assert.equal(b.messages.length, 2);
  const keyA = a.messages.map((m) => m.id).join(',');
  const keyB = b.messages.map((m) => m.id).join(',');
  assert.equal(keyA, keyB);
});

test('session: P2-03 非签名模式（M1 兼容）仍接受未签名消息', () => {
  const a = new Session('pub-a', 'chan-legacy');
  const b = new Session('pub-b', 'chan-legacy');
  assert.equal(a.signed, false);
  const ma = a.send('legacy');
  assert.ok(!ma.sig, '非签名模式不附带签名');
  assert.equal(b.merge(ma), true);   // 兼容历史未签名消息
});

// ---------- 4. transport（内存直连 + 真实适配器） ----------
test('transport: 两节点内存直连收发消息闭环', async () => {
  const ta = new MemoryTransport('node-a');
  const tb = new MemoryTransport('node-b');
  const received = [];
  tb.listen((msg) => received.push(msg));
  await ta.connect({ id: 'node-b' });
  await ta.send({ id: 'm1', payload: 'ping' }, tb);
  assert.equal(received.length, 1);
  assert.equal(received[0].payload, 'ping');
});

test('transport: Transport 抽象基类不可直接实例化', async () => {
  const t = new Transport('node-x');
  // 未实现 _negotiate 时 connect 抛错
  await assert.rejects(() => t.connect({ id: 'peer' }), /未实现/);
});

test('transport: WebRTC 适配器协商建立数据通道', async () => {
  const t1 = new WebRTCTransport('node-a');
  const t2 = new WebRTCTransport('node-b');
  const received = [];
  t2.onData((data, from) => received.push({ data, from }));

  const result = await t1.connect({ id: 'node-b' });
  assert.equal(result.state, 'open');
  assert.equal(result.peer, 'node-b');
  assert.equal(t1.connectionCount, 1);
  assert.equal(t1.type, 'webrtc');

  // ICE 候选已生成
  const ice = t1.getIceCandidates('node-b');
  assert.ok(ice.length > 0);
  // SDP 会话描述已生成
  const sdp = t1.getSDP('node-b');
  assert.ok(sdp.offer && sdp.answer);

  // 数据传递
  await t1.send('node-b', { payload: 'webrtc-data' });
  t2.deliver('node-a', { payload: 'webrtc-data' });
  assert.equal(received.length, 1);
});

test('transport: libp2p 适配器协商建立流', async () => {
  const t1 = new Libp2pTransport('node-a');
  const t2 = new Libp2pTransport('node-b');
  const received = [];
  t2.onData((data, from) => received.push({ data, from }));

  const result = await t1.connect({ id: 'node-b' });
  assert.equal(result.state, 'open');
  assert.equal(t1.type, 'libp2p');

  // 流已建立
  const streams = t1.streams;
  assert.ok(streams.length > 0);
  assert.equal(streams[0].peer, 'node-b');
  assert.equal(streams[0].state, 'open');

  // 数据传递
  await t1.send('node-b', { payload: 'libp2p-data' });
  t2.deliver('node-a', { payload: 'libp2p-data' });
  assert.equal(received.length, 1);
});

test('transport: createTransport 工厂创建各类型', () => {
  const mem = createTransport('memory', 'node-1');
  const webrtc = createTransport('webrtc', 'node-2');
  const libp2p = createTransport('libp2p', 'node-3');
  assert.equal(mem.type, 'memory');
  assert.equal(webrtc.type, 'webrtc');
  assert.equal(libp2p.type, 'libp2p');
  assert.throws(() => createTransport('unknown', 'x'), /未知传输类型/);
});

test('transport: 关闭后无法连接', async () => {
  const t = new MemoryTransport('node-a');
  t.close();
  await assert.rejects(() => t.connect({ id: 'node-b' }), /已关闭/);
});
