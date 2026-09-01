'use strict';
/**
 * case-10 · 传输可靠性：分片重组校验（多路径传输）
 *
 * bug 描述：多路径分片传输中，重组时缺少「分片完整性校验」。
 * 如果分片不完整（缺少某些序号），bug 版本直接返回拼接结果，
 * 导致数据损坏而不报错。
 *
 * 正确行为：
 *   - 必须校验所有分片序号是否齐全（0..total-1 全覆盖）
 *   - 缺少分片时返回 error，不返回部分数据
 *   - 分片齐全时按序号拼接返回完整内容
 *
 * 输入：(shards = [{ seq, total, data }])
 * 输出：{ content: string|null, error: string|null }
 */
function reassemble(shards) {
  if (!Array.isArray(shards) || shards.length === 0) {
    return { content: null, error: '空分片列表' };
  }
  const total = shards[0].total;
  // 检查所有分片的 total 是否一致
  for (const s of shards) {
    if (s.total !== total) return { content: null, error: '分片 total 不一致' };
  }
  // 检查序号是否齐全（0..total-1 全覆盖）
  const seen = new Set(shards.map((s) => s.seq));
  for (let i = 0; i < total; i++) {
    if (!seen.has(i)) {
      // 修复：缺少分片时必须返回 error，不返回部分数据
      return { content: null, error: `缺少分片 ${i}` };
    }
  }
  // 按 seq 排序后拼接
  const ordered = [...shards].sort((a, b) => a.seq - b.seq);
  const content = ordered.map((s) => s.data).join('');
  return { content, error: null };
}

module.exports = reassemble;
