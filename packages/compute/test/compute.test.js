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

test('compute 1.3: 任务 id 用完整 SHA-256（高熵），并绑定 submitter', () => {
  const c = new Compute();
  const task = c.submit({ type: 'hash', input: 'hello', replicas: 3 }, 'alice');
  assert.equal(task.id.length, 64); // 256-bit 完整指纹
  assert.equal(task.submitter, 'alice'); // submitter 绑定
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

test('compute P3-02: split(parts=0/-3) 步长有下限保护，不异常不回环', () => {
  const c = new Compute();
  const task = c.submit({ type: 'hash', input: 'hello', replicas: 3 });
  const r0 = c.split(task.id, 0);
  const rneg = c.split(task.id, -3);
  assert.ok(Array.isArray(r0));
  assert.ok(Array.isArray(rneg));
  assert.equal(r0.join(''), 'hello');
  assert.equal(rneg.join(''), 'hello');
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

test('aggregator P2-06: aggregate(null/undefined) 不抛 TypeError，返回 accepted:false', () => {
  const a = new Aggregator();
  const r1 = a.aggregate(null);
  const r2 = a.aggregate(undefined);
  assert.equal(r1.accepted, false);
  assert.equal(r1.sum, 0);
  assert.equal(r2.accepted, false);
  assert.equal(r2.sum, 0);
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

test('verify P1-01: 10 副本仅 2 一致（少数派）必须 trusted=false', () => {
  const v = new Verify();
  const r = v.verify([6, 6, 1, 2, 3, 4, 5, 7, 8, 9]);
  assert.equal(r.trusted, false);
  assert.equal(r.agreement, 2);
});

test('verify P1-01: 5 副本 3 一致（>n/2）必须 trusted=true', () => {
  const v = new Verify();
  const r = v.verify([6, 6, 6, 7, 8]);
  assert.equal(r.trusted, true);
  assert.equal(r.result, 6);
  assert.equal(r.agreement, 3);
});

test('verify 1.2: 键序无关判等——对象键序不同判为等价', () => {
  const v = new Verify({ minReplicas: 2 });
  const r = v.verify([{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 2 }]);
  assert.equal(r.trusted, true);
  assert.deepEqual(r.result, { a: 1, b: 2 });
  assert.equal(r.agreement, 3);
});

test('verify 1.2: 嵌套对象键序无关判等', () => {
  const v = new Verify({ minReplicas: 2 });
  const r = v.verify([{ x: { m: 1, n: 2 }, y: 3 }, { y: 3, x: { n: 2, m: 1 } }]);
  assert.equal(r.trusted, true);
  assert.equal(r.agreement, 2);
});

test('verify 1.1: 节点身份绑定，同节点重复提交仅计一次（防 Sybil）', () => {
  const v = new Verify({ minReplicas: 2 });
  // 攻击者单节点刷 3 次错误结果，绑定节点后仅计 1，不可伪造多数
  const r = v.verify(
    [
      { nodeId: 'evil', value: 'bad' },
      { nodeId: 'evil', value: 'bad' },
      { nodeId: 'evil', value: 'bad' },
      { nodeId: 'honest1', value: 'good' },
      { nodeId: 'honest2', value: 'good' },
    ],
    { bound: true }
  );
  assert.equal(r.trusted, true);
  assert.equal(r.result, 'good'); // 多数一致由两个诚实节点达成
});

test('verify 1.4: 非法 JSON 值被净化，不参与一致性判定', () => {
  const v = new Verify({ minReplicas: 2 });
  // 净化后仅剩合法标量 42（3 次）与 99（1 次）；函数/symbol/原型污染对象被剔除
  // 严格多数判定：validTotal=4，bestN=3 > 4/2=2 → trusted=true
  const r = v.verify([42, 42, 42, () => 1, Symbol('x'), { __proto__: { p: 1 }, a: 1 }, 99]);
  assert.equal(r.trusted, true);
  assert.equal(r.result, 42); // 合法且出现次数最多（3 次）
  assert.equal(r.agreement, 3);
});

test('verify 1.4: 非法 JSON 值净化后不满足严格多数时不可信', () => {
  const v = new Verify();
  // 净化后仅剩 42（2 次）、{"a":1}（1 次）、99（1 次）：validTotal=4，bestN=2 非 >2 → trusted=false
  const r = v.verify([42, 42, () => 1, Symbol('x'), { __proto__: { p: 1 }, a: 1 }, 99]);
  assert.equal(r.trusted, false);
  assert.equal(r.agreement, 2);
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

test('reputation 2.1: penalize/reward 入参做符号/数值校验，负值抛错', () => {
  const r = new Reputation(50);
  assert.throws(() => r.penalize(-10), TypeError); // 负值不得变为加分
  assert.throws(() => r.reward(-5), TypeError);
  assert.throws(() => r.reward(NaN), TypeError);
  assert.throws(() => r.reward(Infinity), TypeError);
  assert.equal(r.score, 50); // 未受影响
});

test('reputation 2.1: banned 状态不可被加分复活', () => {
  const r = new Reputation(0);
  r.penalize(10); // score = -10 → banned
  assert.equal(r.tier().tier, 'banned');
  r.reward(100); // banned 不可加分复活
  assert.equal(r.score, -10); // 仍为 banned
});

test('reputation 2.2: 字段隔离，外部不可直接写 score', () => {
  const r = new Reputation(50);
  // strict 模式下对只读 getter 赋值直接抛 TypeError，即字段隔离生效
  assert.throws(() => { r.score = 99; }, TypeError);
  assert.equal(r.score, 50); // score 未被篡改
});

test('reputation 2.2: 节流（cooldown）阻止连续刷分', () => {
  const r = new Reputation(50, { cooldownMs: 1000 });
  r.reward(5);
  const first = r.score;
  r.reward(5); // 冷却期内忽略
  assert.equal(r.score, first);
});

test('reputation 2.2: 操作溯源日志记录每次奖励/惩罚', () => {
  const r = new Reputation(50);
  r.reward(5, { note: 'good task' });
  r.penalize(3, { note: 'bad submit' });
  const log = r.auditLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].op, 'reward');
  assert.equal(log[0].delta, 5);
  assert.equal(log[1].op, 'penalize');
  assert.equal(log[1].delta, -3);
  assert.equal(log[0].note, 'good task');
});

test('reputation P1-02: 连续 reward 有次数/累计封顶，无法 1 次会话刷满到 trusted', () => {
  const r = new Reputation(0);
  let count = 0;
  // 无 cooldown 情况下模拟连续加分，验证累计封顶
  while (count < 16) {
    try {
      r.reward(5);
      count += 1;
    } catch (e) {
      // 达到次数/累计上限后必然抛错，跳出循环
      break;
    }
  }
  // 累计加分上限 MAX_REWARD_TOTAL=30，从 0 开始最多 +30，到不了 80 trusted
  assert.ok(r.score < 80, `score=${r.score} 不应刷到 trusted`);
  assert.ok(r.score > 0, 'score 应有所增加');
});

test('reputation P1-02: 次数封顶后 reward 抛错', () => {
  const r = new Reputation(0);
  // 使用较小次数上限快速触发
  const rr = new Reputation(0, { maxRewardCount: 2, maxRewardTotal: 10 });
  rr.reward(5);
  rr.reward(5);
  assert.throws(() => rr.reward(5), /加分次数已达上限/);
});
