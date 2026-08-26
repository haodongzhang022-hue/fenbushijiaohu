'use strict';
/**
 * content 测试信号灯（M4 内容分发）
 *
 * 覆盖 06-进度对齐 M4「视频分片/指纹去重/缓存」：
 *   1. content —— 分片 + 指纹去重
 *   2. storage —— 缓存 + LRU 淘汰 + 命中率
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Content, Storage } = require('../index');

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
