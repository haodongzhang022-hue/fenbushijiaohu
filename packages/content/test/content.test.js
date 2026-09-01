'use strict';
/**
 * content 测试信号灯（M4 内容分发 + M4b 云端/冷存）
 *
 * 覆盖 06-进度对齐 M4「视频分片/指纹去重/缓存」+ M4b「分层存储/云端同步/115冷存」
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Content, Storage, SyncClient, Archive } = require('../index');

// ---------- 1. content（分片 + 指纹去重） ----------
test('content: 内容分片并重组不丢数据', () => {
  const c = new Content();
  const chunks = c.chunk('0123456789', 4);
  assert.equal(chunks.length, 3); // '0123','4567','89'
  assert.equal(chunks.map((x) => x.data).join(''), '0123456789');
  assert.ok(chunks[0].hash.length > 0);
});

test('content: 指纹去重，重复分片只存一份', () => {
  const c = new Content();
  const c1 = c.chunk('hello', 4)[0];
  const c2 = c.chunk('hell', 4)[0]; // 'hell' 与 'hello' 首片 'hell' 相同
  const first = c.register(c1);
  const dup = c.register(c2);
  assert.equal(first, true);
  assert.equal(dup, false); // 去重命中
  assert.equal(c.uniqueCount(), 1);
});

test('content: 按指纹取回分片', () => {
  const c = new Content();
  const [chunk] = c.chunk('abcd', 4);
  c.register(chunk);
  const got = c.lookup(chunk.hash);
  assert.equal(got.data, 'abcd');
  assert.equal(c.lookup('nope'), null);
});

test('content P1-04: chunk(size=0/-1) 不进入死循环，返回合法分片', () => {
  const c = new Content();
  const r0 = c.chunk('hello', 0);
  const rneg = c.chunk('hello', -1);
  assert.ok(Array.isArray(r0));
  assert.ok(Array.isArray(rneg));
  assert.equal(r0.map((x) => x.data).join(''), 'hello');
  assert.equal(rneg.map((x) => x.data).join(''), 'hello');
});

test('content 3.1: 指纹升级为完整 SHA-256（≥128-bit，≥32 hex）', () => {
  const c = new Content();
  const [chunk] = c.chunk('abcd', 4);
  assert.equal(chunk.hash.length, 64); // 256-bit
  assert.ok(chunk.hash.length >= 32);
});

test('content 3.1: 碰撞一致性——不同内容指纹不同（无 64-bit 截断碰撞）', () => {
  const c = new Content();
  // 64-bit 截断下易碰撞的短前缀；完整 SHA-256 下应严格不同
  const [c1] = c.chunk('aaaa', 4);
  const [c2] = c.chunk('aaab', 4);
  const [c3] = c.chunk('aaac', 4);
  const set = new Set([c1.hash, c2.hash, c3.hash]);
  assert.equal(set.size, 3);
});

test('content 3.2: 登记时复核 hash-data 一致性，不一致拒绝', () => {
  const c = new Content();
  const [chunk] = c.chunk('abcd', 4);
  assert.throws(() => c.register({ ...chunk, data: 'tampered' }), /不一致/);
  assert.equal(c.uniqueCount(), 0); // 未登记污染项
});

test('content 3.2: lookup 返回前复核，被污染项被剔除', () => {
  const c = new Content();
  const [chunk] = c.chunk('abcd', 4);
  c.register(chunk);
  // 模拟存储被篡改
  c._store.get(chunk.hash).data = 'evil';
  assert.equal(c.lookup(chunk.hash), null); // 一致性复核剔除
  assert.equal(c.uniqueCount(), 0);
});

// ---------- 2. storage（缓存 + LRU） ----------
test('storage: put/get 命中缓存', () => {
  const s = new Storage();
  s.put('k', 'v');
  assert.equal(s.get('k'), 'v');
  assert.equal(s.get('missing'), null);
});

test('storage: 容量满时 LRU 淘汰最旧键', () => {
  const s = new Storage(2);
  s.put('a', 1);
  s.put('b', 2);
  s.put('c', 3); // 淘汰 a
  assert.equal(s.get('a'), null);
  assert.equal(s.get('b'), 2);
  assert.equal(s.get('c'), 3);
});

test('storage: LRU 访问会刷新，被访问的键不淘汰', () => {
  const s = new Storage(2);
  s.put('a', 1);
  s.put('b', 2);
  s.get('a');          // a 被访问，移到最近
  s.put('c', 3);        // 淘汰 b（最旧）
  assert.equal(s.get('b'), null);
  assert.equal(s.get('a'), 1);
});

test('storage: 命中率统计正确', () => {
  const s = new Storage();
  s.put('k', 'v');
  s.get('k');           // 命中
  s.get('x');           // 未命中
  assert.equal(s.hitRate(), 0.5);
});

// ---------- 3. sync（M4b 云端同步） ----------
test('sync: 推送日志到云端，增量同步', () => {
  const s = new SyncClient();
  const entries = [
    { seq: 0, data: 'msg-0', hash: 'h0' },
    { seq: 1, data: 'msg-1', hash: 'h1' },
    { seq: 2, data: 'msg-2', hash: 'h2' },
  ];
  const r = s.push(entries);
  assert.equal(r.accepted, true);
  assert.equal(r.pushed, 3);
  assert.equal(s.size, 3);
});

test('sync: 从云端拉取增量日志', () => {
  const s = new SyncClient();
  s.push([
    { seq: 0, data: 'a' },
    { seq: 1, data: 'b' },
    { seq: 2, data: 'c' },
  ]);
  const r = s.pull(1); // 从 seq=1 开始
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[0].seq, 1);
  assert.equal(r.entries[1].seq, 2);
});

test('sync: 本地与云端合并，CRDT 收敛去重', () => {
  const s = new SyncClient();
  // 云端已有 0,1,2
  s.push([
    { seq: 0, data: 'a', hash: 'ha' },
    { seq: 1, data: 'b', hash: 'hb' },
    { seq: 2, data: 'c', hash: 'hc' },
  ]);
  // 本地有 0,2,3
  const local = [
    { seq: 0, data: 'a', hash: 'ha' },
    { seq: 2, data: 'c', hash: 'hc' },
    { seq: 3, data: 'd', hash: 'hd' },
  ];
  const r = s.merge(local, s.pull(0).entries);
  assert.equal(r.conflict, false);
  assert.equal(r.merged.length, 4); // 0,1,2,3
});

test('sync: 同 seq 不同 hash 冲突检测', () => {
  const s = new SyncClient();
  s.push([{ seq: 0, data: 'a', hash: 'ha' }]);
  const r = s.push([{ seq: 0, data: 'tampered', hash: 'different' }]);
  assert.equal(r.accepted, false); // 冲突，拒绝
  assert.equal(r.pushed, 0);
});

test('sync: 非法输入抛错', () => {
  const s = new SyncClient();
  assert.throws(() => s.push('not-array'), TypeError);
  assert.throws(() => s.merge('x', 'y'), TypeError);
});

// ---------- 4. archive（M4b 115 冷存归档） ----------
test('archive: 加密归档并可恢复', () => {
  const a = new Archive();
  const { key } = a.archive('secret-data-123');
  assert.equal(a.size, 1);
  const restored = a.restore(key);
  assert.equal(restored, 'secret-data-123');
});

test('archive: 对象数据归档可恢复为 JSON 字符串', () => {
  const a = new Archive();
  const data = { user: 'alice', msg: 'hello world', ts: 1234567890 };
  const { key } = a.archive(data);
  const restored = a.restore(key);
  const parsed = JSON.parse(restored);
  assert.equal(parsed.user, 'alice');
  assert.equal(parsed.msg, 'hello world');
});

test('archive: 数据被篡改后无法恢复（完整性校验）', () => {
  const a = new Archive();
  const { key } = a.archive('sensitive');
  // 篡改归档数据
  const block = a._vault.get(key);
  block.encrypted = Buffer.from('tampered').toString('base64');
  assert.equal(a.restore(key), null); // checksum 不匹配
});

test('archive: 归档键管理（list/remove）', () => {
  const a = new Archive();
  a.archive('data-1', { key: 'k1' });
  a.archive('data-2', { key: 'k2' });
  assert.equal(a.list().length, 2);
  a.remove('k1');
  assert.equal(a.list().length, 1);
  assert.equal(a.restore('k1'), null);
  assert.equal(a.restore('k2'), 'data-2');
});
