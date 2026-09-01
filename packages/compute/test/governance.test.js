'use strict';
/**
 * governance 测试 —— M6 社区治理模块
 *
 * 覆盖 16 号文档 §4.2 Governance：
 *   - report 举报（含权重/冷却/频率限制）
 *   - moderate 分级处置（先限流后封禁）
 *   - verdict 裁决（综合信誉+举报权重）
 *   - weightOf 举报者权重
 *   - appeal 申诉/复核
 *   - auditLog 审计
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Governance, VERDICT_LEVELS } = require('../index');

// ---------- 1. report 举报 ----------
test('governance: 举报计入权重（高信誉举报权重高）', () => {
  const repMap = new Map([
    ['trusted-user', 85],
    ['new-user', 10],
  ]);
  const gov = new Governance({
    reputationOf: (id) => repMap.get(id) || 50,
  });
  const r1 = gov.report('trusted-user', 'bad-user', { reason: 'spam' });
  const r2 = gov.report('new-user', 'bad-user', { reason: 'spam' });
  assert.equal(r1.accepted, true);
  assert.equal(r1.weight, 1.0);      // 高信誉权重=1.0
  assert.equal(r2.accepted, true);
  assert.equal(r2.weight, 0.05);     // 低信誉权重=0.05
});

test('governance: 举报冷却期拒绝', () => {
  const gov = new Governance({ reportCooldownMs: 60000 });
  gov.report('user-a', 'target-x', {});
  const result = gov.report('user-a', 'target-x', {}); // 立即再次举报
  assert.equal(result.accepted, false);
  assert.equal(result.reason, '举报冷却中');
});

test('governance: 举报频率超限拒绝', () => {
  const gov = new Governance({ maxReportsPerHour: 3 });
  gov.report('user-a', 't1', {});
  gov.report('user-a', 't2', {});
  gov.report('user-a', 't3', {});
  const result = gov.report('user-a', 't4', {});
  assert.equal(result.accepted, false);
});

// ---------- 2. moderate 分级处置 ----------
test('governance: 分级处置（先限流后封禁）', () => {
  const gov = new Governance({ reputationOf: (id) => 50 });
  const v1 = gov.moderate(VERDICT_LEVELS.LIMITED, 'user-x', { reason: 'spam' });
  assert.equal(v1.level, VERDICT_LEVELS.LIMITED);
  assert.equal(v1.reviewable, true);
  // 再次加重处置
  const v2 = gov.moderate(VERDICT_LEVELS.BANNED, 'user-x', { reason: 'repeat' });
  assert.equal(v2.level, VERDICT_LEVELS.BANNED);
});

test('governance: 冷启动保护（低信誉不直接封禁）', () => {
  const gov = new Governance({ reputationOf: (id) => 10, coldStartRep: 20 });
  const v = gov.moderate(VERDICT_LEVELS.BANNED, 'new-user', { reason: 'x' });
  // 低信誉新用户封禁被降级为限流
  assert.equal(v.level, VERDICT_LEVELS.LIMITED);
});

test('governance: 非法处置级别抛错', () => {
  const gov = new Governance();
  assert.throws(() => gov.moderate('hack', 'user-x'), /非法处置级别/);
});

// ---------- 3. verdict 裁决 ----------
test('governance: 无举报 → OK', () => {
  const gov = new Governance({ reputationOf: () => 50 });
  const v = gov.verdict('clean-user');
  assert.equal(v.level, VERDICT_LEVELS.OK);
});

test('governance: 多次高权重举报 → BANNED', () => {
  const gov = new Governance({
    reputationOf: (id) => (id.startsWith('reporter') ? 90 : 50),
  });
  gov.report('reporter-1', 'bad-user', {});
  gov.report('reporter-2', 'bad-user', {});
  gov.report('reporter-3', 'bad-user', {});
  gov.report('reporter-4', 'bad-user', {});
  const v = gov.verdict('bad-user');
  assert.equal(v.level, VERDICT_LEVELS.BANNED);
});

// ---------- 4. weightOf ----------
test('governance: 举报者权重分档', () => {
  const gov = new Governance({
    reputationOf: (id) => id === 'trusted' ? 85 : id === 'regular' ? 60 : id === 'newbie' ? 10 : 50,
  });
  assert.equal(gov.weightOf('trusted'), 1.0);
  assert.equal(gov.weightOf('regular'), 0.7);
  assert.equal(gov.weightOf('newbie'), 0.05);
});

// ---------- 5. appeal 申诉 ----------
test('governance: 申诉可降级处置', () => {
  const gov = new Governance({ reputationOf: () => 50 });
  gov.moderate(VERDICT_LEVELS.BANNED, 'user-y', { reason: 'x', reviewable: true });
  const result = gov.appeal('user-y', '我是冤枉的');
  assert.equal(result.appealed, true);
  assert.equal(result.level, VERDICT_LEVELS.LIMITED); // banned→limited
});

test('governance: 不可复核的裁决无法申诉', () => {
  const gov = new Governance({ reputationOf: () => 50 });
  gov.moderate(VERDICT_LEVELS.BANNED, 'user-z', { reason: 'x', reviewable: false });
  const result = gov.appeal('user-z', '申诉');
  assert.equal(result.appealed, false);
});

// ---------- 6. auditLog ----------
test('governance: 审计日志可回溯', () => {
  const gov = new Governance({ reputationOf: () => 50 });
  gov.report('user-a', 'user-b', { reason: 'x' });
  gov.moderate(VERDICT_LEVELS.WARN, 'user-b', { reason: 'x' });
  const log = gov.auditLog();
  assert.ok(log.length >= 2);
  const types = log.map((e) => e.type);
  assert.ok(types.includes('report'));
  assert.ok(types.includes('verdict'));
});
