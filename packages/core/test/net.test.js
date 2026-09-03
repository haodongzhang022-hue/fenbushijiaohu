'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { NetTransport, encodeFrame, createTransport } = require('../src/transport');

function waitFor(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test('net: NetTransport 在回环上真实监听并获得端口', async () => {
  const t = new NetTransport('A', { autoListen: true });
  await waitFor(50);
  assert.strictEqual(t.type, 'net');
  assert.ok(t.port > 0, '应在回环上监听获得真实端口');
  assert.strictEqual(t.isNetworkReady, true);
  assert.strictEqual(t.state, 'idle');
  t.close();
});

test('net: 两节点经真实 TCP 回环直连并收发消息', async () => {
  const reg = {};
  const A = new NetTransport('A', { registry: reg });
  const B = new NetTransport('B', { registry: reg });
  await waitFor(50);

  const got = [];
  B.onData((data, from) => got.push({ data, from }));

  const res = await A.connect({ id: 'B' }); // 经共享地址簿解析 B 端口
  assert.strictEqual(res.state, 'open');
  assert.strictEqual(A.peers.length, 1);
  assert.strictEqual(A.peers[0], 'B');
  // 等 B 侧完成握手登记
  await waitFor(100);
  assert.strictEqual(B.peers.length, 1, '被叫侧 B 应登记拨号方 A');

  const sent = await A.send('B', { kind: 'hello', text: '真实TCP消息' });
  assert.strictEqual(sent, true);
  await waitFor(100);
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].data.text, '真实TCP消息');
  assert.strictEqual(got[0].from, 'A');

  A.close(); B.close();
});

test('net: 两节点双向收发（B 也能回 A）', async () => {
  const reg = {};
  const A = new NetTransport('A', { registry: reg });
  const B = new NetTransport('B', { registry: reg });
  await waitFor(50);

  const aGot = [];
  A.onData((data, from) => aGot.push({ data, from }));

  await A.connect({ id: 'B' });
  await waitFor(100);

  await B.send('A', { kind: 'pong', seq: 1 });
  await waitFor(100);
  assert.strictEqual(aGot.length, 1);
  assert.strictEqual(aGot[0].data.kind, 'pong');
  assert.strictEqual(aGot[0].from, 'B');

  A.close(); B.close();
});

test('net: createTransport 工厂可创建 net 类型', async () => {
  const t = createTransport('net', 'X');
  await waitFor(50);
  assert.strictEqual(t.type, 'net');
  assert.ok(t.port > 0);
  t.close();
});

test('net: 连接不存在地址的对端时抛错', async () => {
  const A = new NetTransport('A');
  await waitFor(30);
  await assert.rejects(
    () => A.connect({ id: 'ghost', host: '127.0.0.1', port: 1 }),
    /找不到对端|ECONNREFUSED|握手超时/
  );
  A.close();
});

test('net: 关闭后无法连接（_assertOpen 防护）', async () => {
  const A = new NetTransport('A');
  await waitFor(30);
  A.close();
  await assert.rejects(() => A.connect({ id: 'B' }), /已关闭/);
});

test('net: encodeFrame 长度前缀可往返解码', () => {
  const frame = encodeFrame({ from: 'A', to: 'B', kind: 'ping' });
  const len = frame.readUInt32BE(0);
  const body = JSON.parse(frame.slice(4, 4 + len).toString('utf8'));
  assert.strictEqual(body.kind, 'ping');
});
