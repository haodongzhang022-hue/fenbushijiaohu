'use strict';
/**
 * M4b 测试信号灯 —— 云端同步 + 115 冷存归档
 *
 * 覆盖 16-M4bM5M6与传输层设计 §2：
 *   1. CloudSync —— 增量同步 / 游标 / 冲突收敛
 *   2. Archive115 —— 加密归档 / 一键恢复 / 定期调度
 *
 * 对应测试报告 BLK-01：云端一致性/分层存储/115 冷存模块落地。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { CloudSync, Archive115, Storage } = require('../index');

// 内存云端适配器（模拟 S3 兼容对象存储）
function makeCloudAdapter() {
  const map = {};
  return {
    put: async (k, v) => { map[String(k)] = v; return true; },
    get: async (k) => map[String(k)] || null,
    keys: async () => Object.keys(map),
    _map: map,
  };
}

// 内存 115 归档适配器
function makeArchiveAdapter() {
  const map = new Map();
  return {
    save: async (id, bundle) => { map.set(String(id), bundle); return true; },
    load: async (id) => map.get(String(id)) || null,
    _map: map,
  };
}

// ---------- 1. CloudSync ----------
test('CloudSync: 追加账本条目并生成序号/时钟/指纹', () => {
  const sync = new CloudSync();
  const e1 = sync.append('hello');
  const e2 = sync.append('world');
  assert.equal(e1.seq, 1);
  assert.equal(e2.seq, 2);
  assert.equal(e1.clock, 1);
  assert.equal(e2.clock, 2);
  assert.ok(e1.hash.length === 64); // SHA-256
  assert.notEqual(e1.hash, e2.hash);
  assert.equal(sync.getCursor(), 0); // 尚未同步
  assert.equal(sync.ledgerSize, 2);
});

test('CloudSync: 追加空串抛错', () => {
  const sync = new CloudSync();
  assert.throws(() => sync.append(''), /非空字符串/);
});

test('CloudSync: pushLocalDelta 推送增量并更新游标', async () => {
  const sync = new CloudSync();
  sync.append('a');
  sync.append('b');
  const result = await sync.pushLocalDelta();
  assert.equal(result.pushed, 2);
  assert.equal(result.cursor, 2);
  assert.equal(sync.getCursor(), 2);
  assert.equal(sync.getState(), 'converged');
});

test('CloudSync: 无新增时推送返回 0', async () => {
  const sync = new CloudSync();
  sync.append('a');
  await sync.pushLocalDelta();
  const result = await sync.pushLocalDelta();
  assert.equal(result.pushed, 0);
  assert.equal(result.cursor, 1);
});

test('CloudSync: pullSince 拉取云端增量（共享云端适配器）', async () => {
  const cloud = makeCloudAdapter();
  const writer = new CloudSync({ cloudAdapter: cloud });
  writer.append('entry1');
  await writer.pushLocalDelta();
  writer.append('entry2');
  await writer.pushLocalDelta();
  // 新实例从共享云端拉取
  const reader = new CloudSync({ cloudAdapter: cloud });
  const { entries, cursor } = await reader.pullSince(0);
  assert.equal(entries.length, 2);
  assert.equal(cursor, 2);
  assert.equal(entries[0].seq, 1);
  assert.equal(entries[1].seq, 2);
});

test('CloudSync: 冲突合并——同 seq 不同 clock 选后写', () => {
  const sync = new CloudSync();
  const a = { seq: 5, clock: 3, hash: 'hash-a', data: 'older' };
  const b = { seq: 5, clock: 5, hash: 'hash-b', data: 'newer' };
  const winner = sync.mergeConflict(a, b);
  assert.equal(winner, b); // clock 大者胜
});

test('CloudSync: 冲突合并——同 seq 同时钟按哈希字典序', () => {
  const sync = new CloudSync();
  const a = { seq: 7, clock: 2, hash: 'aaa', data: 'a' };
  const b = { seq: 7, clock: 2, hash: 'bbb', data: 'b' };
  const winner = sync.mergeConflict(a, b);
  assert.equal(winner, a); // hash 小者胜
});

test('CloudSync: merge 合并远程增量到本地', async () => {
  const sync = new CloudSync();
  sync.append('local1');
  await sync.pushLocalDelta();
  // 模拟远程另一个条目 seq=1（冲突）
  const remoteEntries = [
    { seq: 1, clock: 2, hash: 'remote-1', data: 'remote1', meta: {} },
    { seq: 2, clock: 2, hash: 'remote-2', data: 'remote2', meta: {} },
  ];
  const count = sync.merge(remoteEntries);
  assert.equal(count, 2);
  // 本地 seq=1 与 remote seq=1 冲突，remote clock=2 > 本地 clock=1，remote 胜
  const merged = sync.getLedger();
  assert.equal(merged[0].data, 'remote1');
  assert.equal(merged[1].data, 'remote2');
});

test('CloudSync: 使用 Storage 缓存账本', () => {
  const storage = new Storage(100);
  const sync = new CloudSync({ storage });
  sync.append('cached');
  const cached = storage.get('ledger:1');
  assert.ok(cached);
  assert.equal(cached.data, 'cached');
});

// ---------- 2. Archive115 ----------
test('Archive115: 归档账本增量并生成 archiveId', async () => {
  const sync = new CloudSync();
  sync.append('data1');
  sync.append('data2');
  const arch = new Archive115({ sync });
  const result = await arch.archive();
  assert.ok(result.archiveId);
  assert.equal(result.entries, 2);
  assert.equal(result.cursor, 2);
  assert.equal(arch.getState(), 'archived');
  assert.equal(arch.listArchives().length, 1);
});

test('Archive115: 归档空账本返回空结果', async () => {
  const arch = new Archive115();
  const result = await arch.archive([]);
  assert.equal(result.archiveId, null);
  assert.equal(result.entries, 0);
});

test('Archive115: 加密归档不可明文读（AES-256-GCM）', async () => {
  const sync = new CloudSync();
  sync.append('secret-data');
  const arch = new Archive115({ sync });
  await arch.archive();
  // 查看存储中的 bundle，确认 data 已加密（不含明文）
  const bundle = arch._archive._map.get(arch.getLastArchiveId());
  assert.ok(bundle);
  assert.ok(!bundle.encrypted.data.includes('secret-data'));
  assert.equal(bundle.encrypted.data.length > 32, true);
});

test('Archive115: 一键恢复还原账本', async () => {
  const archiveAdapter = makeArchiveAdapter();
  const sync = new CloudSync();
  sync.append('restore-me');
  const key = crypto.randomBytes(32).toString('hex');
  const arch = new Archive115({ sync, archiveAdapter, encryptionKey: key });
  const { archiveId } = await arch.archive();
  // 新实例从共享 115 恢复（使用相同加密密钥）
  const restorer = new Archive115({ sync, archiveAdapter, encryptionKey: key });
  const result = await restorer.restore();
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].data, 'restore-me');
  assert.equal(result.archiveId, archiveId);
});

test('Archive115: 无归档时 restore 返回空', async () => {
  const arch = new Archive115();
  const result = await arch.restore();
  assert.equal(result.entries.length, 0);
  assert.equal(result.archiveId, null);
});

test('Archive115: 定期调度执行归档', async () => {
  const sync = new CloudSync();
  sync.append('scheduled');
  const arch = new Archive115({ sync });
  await arch.schedule(1);
  assert.equal(arch.listArchives().length, 1);
  assert.equal(arch.getPeriodDays(), 1);
  arch.stopSchedule();
});

test('Archive115: 自定义加密密钥可正确还原', async () => {
  const archiveAdapter = makeArchiveAdapter();
  const sync = new CloudSync();
  sync.append('encrypted-data');
  const key = crypto.randomBytes(32).toString('hex');
  const arch = new Archive115({ sync, archiveAdapter, encryptionKey: key });
  const { archiveId } = await arch.archive();
  // 用相同 key 还原
  const restorer = new Archive115({ sync, archiveAdapter, encryptionKey: key });
  const result = await restorer.restore();
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].data, 'encrypted-data');
});

test('Archive115: restore 还原指定 cursor 的归档', async () => {
  const archiveAdapter = makeArchiveAdapter();
  const sync = new CloudSync();
  sync.append('batch1');
  const key = crypto.randomBytes(32).toString('hex');
  const arch = new Archive115({ sync, archiveAdapter, encryptionKey: key });
  await arch.archive(); // 游标=1
  sync.append('batch2');
  await arch.archive(); // 游标=2
  // 还原 cursor=1 的归档
  const restorer = new Archive115({ sync, archiveAdapter, encryptionKey: key });
  const result = await restorer.restore(1);
  assert.equal(result.entries.length, 1); // 只还原第一批
  assert.equal(result.entries[0].data, 'batch1');
});
