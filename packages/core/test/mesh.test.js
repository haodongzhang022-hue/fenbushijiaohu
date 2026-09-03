'use strict';
/**
 * NetMesh 多节点真实 TCP 回环 mesh 演练测试
 *
 * 覆盖 06-进度对齐 P0「多节点真实回环 mesh 演练」：
 *   1. 3+ 节点经真实 TCP 回环全互联
 *   2. 任意节点向 mesh 内任一节点发送消息（真实 socket 端到端）
 *   3. 广播可达 mesh 内全部其它节点
 *   4. 节点掉线后 mesh 拓扑感知
 *   5. NetTransport/encodeFrame 顶层导出（修复 index.js 遗漏）
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { NetMesh } = require('../src/transport/mesh');
const { NetTransport, encodeFrame, createTransport } = require('../src/transport');

function waitFor(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- 1. 三节点全互联 ----------
test('netmesh: 3 节点经真实 TCP 回环全互联', async () => {
  const mesh = new NetMesh();
  const a = await mesh.addNode('A');
  const b = await mesh.addNode('B');
  const c = await mesh.addNode('C');

  assert.strictEqual(mesh.size, 3);
  assert.ok(a.port > 0);
  assert.ok(b.port > 0);
  assert.ok(c.port > 0);

  // 每个节点至少与其他节点建立了 TCP 连接
  const topo = mesh.getTopology();
  assert.strictEqual(topo.length, 3);
  for (const node of topo) {
    assert.strictEqual(node.peers.length, 2, `节点 ${node.id} 应连接其余 2 个节点`);
  }

  mesh.close();
});

// ---------- 2. 点对点真实 socket 收发 ----------
test('netmesh: A→B 点对点经真实 TCP socket 收发', async () => {
  const mesh = new NetMesh();
  await mesh.addNode('A');
  await mesh.addNode('B');

  const bGot = [];
  mesh.onData('B', (data, from) => bGot.push({ data, from }));

  const sent = await mesh.sendTo('A', 'B', { kind: 'hello', payload: 'mesh-msg-1' });
  assert.strictEqual(sent, true);
  await waitFor(200);
  assert.strictEqual(bGot.length, 1);
  assert.strictEqual(bGot[0].data.payload, 'mesh-msg-1');
  assert.strictEqual(bGot[0].from, 'A');

  mesh.close();
});

// ---------- 3. 三节点广播 ----------
test('netmesh: A 广播到达 B/C 两个节点', async () => {
  const mesh = new NetMesh();
  await mesh.addNode('A');
  await mesh.addNode('B');
  await mesh.addNode('C');

  const bGot = [];
  const cGot = [];
  mesh.onData('B', (d, f) => bGot.push({ d, f }));
  mesh.onData('C', (d, f) => cGot.push({ d, f }));

  const n = await mesh.broadcast('A', { kind: 'notify', payload: 'mesh-broadcast' });
  assert.strictEqual(n, 2); // B 和 C 都应收到
  await waitFor(200);
  assert.strictEqual(bGot.length, 1);
  assert.strictEqual(cGot.length, 1);
  assert.strictEqual(bGot[0].d.payload, 'mesh-broadcast');
  assert.strictEqual(cGot[0].d.payload, 'mesh-broadcast');

  mesh.close();
});

// ---------- 4. 多节点间互相收发（mesh 网格） ----------
test('netmesh: B→C、C→A 交叉收发（真实 socket 网格）', async () => {
  const mesh = new NetMesh();
  await mesh.addNode('A');
  await mesh.addNode('B');
  await mesh.addNode('C');

  const aGot = [];
  const cGot = [];
  mesh.onData('A', (d, f) => aGot.push({ d, f }));
  mesh.onData('C', (d, f) => cGot.push({ d, f }));

  await mesh.sendTo('B', 'C', { kind: 'data', payload: 'B→C' });
  await mesh.sendTo('C', 'A', { kind: 'data', payload: 'C→A' });
  await waitFor(300);

  assert.strictEqual(cGot.length, 1);
  assert.strictEqual(cGot[0].d.payload, 'B→C');
  assert.strictEqual(cGot[0].f, 'B');

  assert.strictEqual(aGot.length, 1);
  assert.strictEqual(aGot[0].d.payload, 'C→A');
  assert.strictEqual(aGot[0].f, 'C');

  mesh.close();
});

// ---------- 5. 节点掉线 ----------
test('netmesh: removeNode 后 mesh 感知节点离线', async () => {
  const mesh = new NetMesh();
  await mesh.addNode('A');
  await mesh.addNode('B');
  await mesh.addNode('C');
  assert.strictEqual(mesh.size, 3);

  mesh.removeNode('C');
  assert.strictEqual(mesh.size, 2);
  assert.strictEqual(mesh.has('C'), false);
  assert.deepStrictEqual(mesh.nodeIds.sort(), ['A', 'B']);

  // 剩余节点 A/B 仍可通信
  const bGot = [];
  mesh.onData('B', (d, f) => bGot.push({ d, f }));
  await mesh.sendTo('A', 'B', { kind: 'ping', payload: 'still-alive' });
  await waitFor(200);
  assert.strictEqual(bGot.length, 1);

  mesh.close();
});

// ---------- 6. 向不在 mesh 的节点发消息 → 抛错 ----------
test('netmesh: 向不在 mesh 的目标发消息抛错', async () => {
  const mesh = new NetMesh();
  await mesh.addNode('A');
  await mesh.addNode('B');
  await assert.rejects(
    () => mesh.sendTo('A', 'ghost', { payload: 'x' }),
    /不在 mesh 中/
  );
  mesh.close();
});

// ---------- 7. 顶层导出修复验证 ----------
test('core index: 导出 NetTransport/encodeFrame/NetMesh', () => {
  const core = require('../index');
  assert.ok(typeof core.NetTransport === 'function');
  assert.ok(typeof core.encodeFrame === 'function');
  assert.ok(typeof core.NetMesh === 'function');
  assert.ok(typeof core.createTransport === 'function');
  assert.ok(typeof core.NetTransport.prototype.send === 'function');
});

// ---------- 8. 大型 mesh（5 节点）稳定性 ----------
test('netmesh: 5 节点大规模 mesh 稳定性', async () => {
  const mesh = new NetMesh();
  const ids = ['n1', 'n2', 'n3', 'n4', 'n5'];
  for (const id of ids) {
    await mesh.addNode(id);
  }
  assert.strictEqual(mesh.size, 5);

  // n1 广播到全部
  const received = {};
  for (const id of ids.slice(1)) {
    mesh.onData(id, (d, f) => {
      received[id] = received[id] || 0;
      received[id]++;
    });
  }
  const n = await mesh.broadcast('n1', { kind: 'sync', payload: 'mesh-sync' });
  assert.strictEqual(n, 4);
  await waitFor(400);
  for (const id of ids.slice(1)) {
    assert.strictEqual(received[id], 1, `${id} 应收到 1 条广播`);
  }

  mesh.close();
});
