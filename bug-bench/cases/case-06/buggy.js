'use strict';
/**
 * case-06 · session 去重：同 ts 冲突收敛（高区分度用例）
 *
 * 正确行为（04 §3.2 + CRDT 收敛语义）：
 *   去重必须同时考虑 ts 与 contentHash——同 ts 不同内容走「冲突合并」
 *   （保留较高内容哈希者），同 ts 同内容才去重，新 ts 追加。
 *
 * 输入：(stored = [{ts, contentHash}], incoming = {ts, contentHash})
 * 输出：{ mergedCount, lostConflict: boolean }
 */
function sessionDedup(stored, incoming) {
  const have = stored.find((s) => s.ts === incoming.ts);
  if (!have) {
    stored.push(incoming);
    return { mergedCount: stored.length, lostConflict: false };
  }
  if (have.contentHash !== incoming.contentHash) {
    if (incoming.contentHash > have.contentHash) {
      have.contentHash = incoming.contentHash;
    }
    return { mergedCount: stored.length, lostConflict: false };
  }
  return { mergedCount: stored.length, lostConflict: false };
}

module.exports = sessionDedup;
