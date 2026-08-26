'use strict';
/**
 * case-06 · session 去重：同 ts 冲突收敛（高区分度用例）
 *
 * 场景：多节点并发时，可能出现「同 Lamport ts、不同内容」的冲突消息。
 * 正确行为（04 §3.2 + CRDT 收敛语义）：
 *   去重必须同时考虑 ts 与 contentHash——仅靠 ts 去重会误删不同内容，
 *   仅靠内容去重会破坏因果序。
 *   当收到一条 ts 已存在但 contentHash 不同的消息时，必须走「冲突合并」
 *   （保留较高内容哈希者），而不是简单丢弃。
 *
 * BUG（隐蔽点）：这里错误地「仅按 ts 去重，重复即丢弃」。
 *   对「同 ts 不同内容」的冲突消息直接丢弃，导致内容丢失、收敛不一致。
 *   单测浅层「收到重复 ts 就忽略」会看似通过，但严格断言能抓住。
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
  // BUG: 仅按 ts 去重，重复即丢弃；未处理「同 ts 不同内容」的冲突合并
  //      正确做法：若 contentHash 不同应保留较高者，不得丢弃。
  return { mergedCount: stored.length, lostConflict: true };
}

module.exports = sessionDedup;
