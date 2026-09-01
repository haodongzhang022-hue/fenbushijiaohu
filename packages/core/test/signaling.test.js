'use strict';
/**
 * signaling 测试 —— 信令服务（SignalingServer + WebRTC/Libp2p 经信令建连）
 *
 * 覆盖 P0 真实网络接入的基础设施验证：
 *   1. SignalingServer 房间模型：join/leave/peers
 *   2. 经信令交换 SDP/ICE（WebRTC 模式）
 *   3. 经信令交换 multiaddr（libp2p 模式）
 *   4. 信令路由消息传递
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SignalingServer,
  SignalingSession,
  createSignaling,
  WebRTCTransport,
  Libp2pTransport,
} = require('../index');

// ---------- 1. SignalingServer 房间模型 ----------
test('signaling: join 房间后 peers 列表正确', async () => {
  const server = createSignaling('memory');
  const sA = await server.join('room-1', 'node-a');
  const sB = await server.join('room-1', 'node-b');

  assert.ok(sA instanceof SignalingSession);
  assert.ok(sB instanceof SignalingSession);
  assert.equal(server.onlineCount('room-1'), 2);

  // 各自 peers 列表包含对方
  const peersOfA = sA.peers();
  const peersOfB = sB.peers();
  assert.ok(peersOfA.includes('node-b'));
  assert.ok(peersOfB.includes('node-a'));

  server.close();
});

test('signaling: leave 后 peers 更新', async () => {
  const server = createSignaling('memory');
  const sA = await server.join('room-x', 'node-a');
  const sB = await server.join('room-x', 'node-b');
  const sC = await server.join('room-x', 'node-c');
  assert.equal(server.onlineCount('room-x'), 3);

  sB.roomId = 'room-x'; // 使用 session 内部
  server.leave('room-x', 'node-b');
  assert.equal(server.onlineCount('room-x'), 2);

  const peersOfA = sA.peers();
  assert.ok(!peersOfA.includes('node-b'));
  assert.ok(peersOfA.includes('node-c'));

  server.close();
});

// ---------- 2. 信令消息路由 ----------
test('signaling: 同房间点对点路由消息', async () => {
  const server = createSignaling('memory');
  const sA = await server.join('room-sig', 'node-a');
  const sB = await server.join('room-sig', 'node-b');

  const received = [];
  sB.on('message', (msg) => received.push(msg));

  const ok = await sA.signal('node-b', { type: 'offer', sdp: 'sdp-offer' });
  assert.equal(ok, true);
  assert.equal(received.length, 1);
  assert.equal(received[0].from, 'node-a');
  assert.equal(received[0].payload.type, 'offer');
  assert.equal(received[0].payload.sdp, 'sdp-offer');

  server.close();
});

test('signaling: 广播给同房间所有对端', async () => {
  const server = createSignaling('memory');
  const sA = await server.join('room-bc', 'node-a');
  const sB = await server.join('room-bc', 'node-b');
  const sC = await server.join('room-bc', 'node-c');

  const receivedB = [];
  const receivedC = [];
  sB.on('message', (m) => receivedB.push(m));
  sC.on('message', (m) => receivedC.push(m));

  const allOk = await sA.broadcast({ type: 'ident', addr: '/ip4/1.2.3.4' });
  assert.equal(allOk, true);
  assert.equal(receivedB.length, 1);
  assert.equal(receivedC.length, 1);

  server.close();
});

test('signaling: 向不在线节点发送返回 false', async () => {
  const server = createSignaling('memory');
  const sA = await server.join('room-offline', 'node-a');
  const ok = await sA.signal('ghost-node', { type: 'offer' });
  assert.equal(ok, false);
  server.close();
});

// ---------- 3. WebRTC 经信令建连 ----------
test('webrtc-signaling: 经信令交换 SDP/ICE 建立连接', async () => {
  const server = createSignaling('memory');
  const tA = new WebRTCTransport('node-a', { signaling: server });
  const tB = new WebRTCTransport('node-b', { signaling: server });

  // 双方都加入信令房间
  await tA.joinRoom('webrtc-room', server);
  await tB.joinRoom('webrtc-room', server);

  // A 向 B 发起连接
  const result = await tA.connect({ id: 'node-b' });
  assert.equal(result.state, 'open');
  assert.equal(result.peer, 'node-b');

  // B 侧也应有入站连接
  assert.equal(tB.connectionCount, 1);

  // SDP 已交换
  const sdp = tA.getSDP('node-b');
  assert.ok(sdp.offer && sdp.answer);
  assert.equal(sdp.offer.from, 'node-a');
  assert.equal(sdp.answer.from, 'node-b');

  server.close();
  tA.close();
  tB.close();
});

// ---------- 4. libp2p 经信令建连 ----------
test('libp2p-signaling: 经信令交换 multiaddr 建立流', async () => {
  const server = createSignaling('memory');
  const tA = new Libp2pTransport('node-a', {
    signaling: server,
    listenAddr: '/ip4/127.0.0.1/tcp/8081/p2p/node-a',
  });
  const tB = new Libp2pTransport('node-b', {
    signaling: server,
    listenAddr: '/ip4/127.0.0.1/tcp/8082/p2p/node-b',
  });

  // 双方都加入信令房间
  await tA.joinRoom('libp2p-room', server);
  await tB.joinRoom('libp2p-room', server);

  // A 向 B 发起拨号
  const result = await tA.connect({ id: 'node-b' });
  assert.equal(result.state, 'open');
  assert.equal(result.peer, 'node-b');

  // B 侧应有入站流
  const bStreams = tB.streams;
  assert.ok(bStreams.length > 0);
  assert.equal(bStreams[0].peer, 'node-a');

  // 流经信令建立
  const aStreams = tA.streams;
  assert.ok(aStreams.length > 0);
  assert.equal(aStreams[0].viaSignaling, true);

  server.close();
  tA.close();
  tB.close();
});

// ---------- 5. 信令数据投递 ----------
test('webrtc-signaling: 经信令建立后数据可传递', async () => {
  const server = createSignaling('memory');
  const tA = new WebRTCTransport('node-a', { signaling: server });
  const tB = new WebRTCTransport('node-b', { signaling: server });

  const receivedB = [];
  tB.onData((data, from) => receivedB.push({ data, from }));

  await tA.joinRoom('data-room', server);
  await tB.joinRoom('data-room', server);
  await tA.connect({ id: 'node-b' });

  // 经信令发送数据
  await tA.send('node-b', { type: 'text', payload: 'hello-via-signaling' });

  // B 侧模拟收到
  tB.deliver('node-a', { type: 'text', payload: 'hello-via-signaling' });
  assert.equal(receivedB.length, 1);
  assert.equal(receivedB[0].data.payload, 'hello-via-signaling');

  server.close();
  tA.close();
  tB.close();
});

test('signaling: createSignaling 工厂创建 SignalingServer', () => {
  const server = createSignaling('memory');
  assert.ok(server instanceof SignalingServer);
  assert.equal(server.mode, 'memory');
  server.close();
});
