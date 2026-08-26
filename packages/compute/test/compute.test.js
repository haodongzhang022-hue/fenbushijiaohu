'use strict';
/**
 * compute 测试信号灯（M3 分布式计算）
 *
 * 覆盖 02 §4 计算层 + 06-进度对齐 M3「任务切分/聚合/校验/信誉」：
 *   1. compute    —— 任务登记 + 切分 + 收集
 *   2. aggregator —— 聚合（异常拒绝 + 正常累加）
 *   3. verify     —— 多副本交叉校验
 *   4. reputation —— 信誉分档位 + 单向棘轮
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Compute, Aggregator, Verify, Reputation } = require('../index');

// ---------- 1. compute（任务切分） ----------
test('compute: 提交任务生成确定性 id 并可切分', () => {
  const c = new Compute();
  const task = c.submit({ type: 'hash', input: 'hello', replicas: 3 });
  assert.equal(task.replicas, 3);
  assert.ok(task.id.length > 0);
  const chunks = c.split(task.id, 2);
  assert.equal(chunks.join(''), 'hello'); // 切分后重组不丢内容
});

test('compute: 收集副本结果可计数', () => {
  const c = new Compute();
  const task = c.submit({ type: 'sum', input: '1,2,3', replicas: 3 });
  c.collect(task.id, 6);
  c.collect(task.id, 6);
  assert.equal(c.resultCount(task.id), 2);
});

test('compute: 切分不存在的任务抛错', () => {
  const c = new Compute();
  assert.throws(() => c.split('nope', 2), /任务不存在/);
});

// ---------- 2. aggregator（聚合） ----------
test('aggregator: 含异常值必须拒绝且 sum=0', () => {
  const a = new Aggregator();
  const r = a.aggregate([1, 2, -3]);
  assert.equal(r.accepted, false);
  assert.equal(r.sum, 0);
});

test('aggregator: 正常累加不丢前序', () => {
  const a = new Aggregator();
  const r = a.aggregate([1, 2, 3, 4, 5]);
  assert.equal(r.accepted, true);
  assert.equal(r.sum, 15);
});

test('aggregator: 空数组 accepted 且 sum=0', () => {
  const a = new Aggregator();
  const r = a.aggregate([]);
  assert.equal(r.accepted, true);
  assert.equal(r.sum, 0);
});

// ---------- 3. verify（多副本校验） ----------
test('verify: 多数一致结果被判为可信', () => {
  const v = new Verify({ minReplicas: 2 });
  const r = v.verify([6, 6, 7]);
  assert.equal(r.trusted, true);
  assert.equal(r.result, 6);
  assert.equal(r.agreement, 2);
});

test('verify: 无一致多数时不可信', () => {
  const v = new Verify({ minReplicas: 2 });
  const r = v.verify([6, 7, 8]);
  assert.equal(r.trusted, false);
});

// ---------- 4. reputation（信誉分） ----------
test('reputation: 档位边界归属正确', () => {
  const r80 = new Reputation(80);
  assert.equal(r80.tier().tier, 'trusted');
  const r50 = new Reputation(50);
  assert.equal(r50.tier().tier, 'regular');
  const r49 = new Reputation(49);
  assert.equal(r49.tier().tier, 'limited');
  const r0 = new Reputation(0);
  assert.equal(r0.tier().tier, 'limited');
  const rneg = new Reputation(-1);
  assert.equal(rneg.tier().tier, 'banned');
  assert.equal(rneg.tier().cap, 0);
});

test('reputation: 单向棘轮，扣分可到 banned', () => {
  const r = new Reputation(50);
  r.penalize(100);
  assert.equal(r.score, -50);
  assert.equal(r.tier().tier, 'banned');
});

test('reputation: reward 受上限约束，单次加分有上限', () => {
  const r = new Reputation(98);
  r.reward(100);
  assert.equal(r.score, 100); // 封顶 100
});
