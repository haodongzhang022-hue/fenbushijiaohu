'use strict';
/**
 * case-09 · 多节点消息收敛（CRDT 收敛一致性）
 *
 * bug 描述：在多节点场景下，merge() 中丢失了「同 key 冲突时取 ts 大者」
 * 的规则。bug 版本直接用新消息覆盖旧消息，不比较 ts，导致乱序到达时
 * 后到的旧消息覆盖了先到的新消息，收敛结果不确定。
 *
 * 正确行为（LWW-Element-Set 语义）：
 *   - 同 key 冲突时取 ts 更大者胜出
 *   - ts 相等时按 id 字典序 tie-break
 *   - 多节点并发后，所有节点收敛到同一消息序列
 *
 * 输入：(messages[] 乱序到达的消息列表)
 * 输出：{ messages: Array, converged: boolean }
 */
function converge(msgs) {
  const map = new Map();
  for (const msg of msgs) {
    const key = `${msg.channelId}:${msg.id}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, msg);
    } else {
      // 修复：同 key 冲突时取 ts 大者胜出；ts 相等按 id 字典序
      if (msg.ts > existing.ts ||
          (msg.ts === existing.ts && msg.id < existing.id)) {
        map.set(key, msg);
      }
    }
  }
  const result = [...map.values()].sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.id < b.id ? -1 : 1;
  });
  return { messages: result, converged: result.length > 0 };
}

module.exports = converge;
