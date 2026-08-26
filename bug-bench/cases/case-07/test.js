'use strict';
/**
 * case-07 测试断言（高区分度）
 * 按 04 §3.4 契约严格校验边界值归属。
 */
module.exports = {
  tests: [
    { name: 'case-07 score=80 应为 trusted', fn: (f) => f(80).tier === 'trusted' },
    { name: 'case-07 score=100 应为 trusted cap=100', fn: (f) => { const r = f(100); return r.tier === 'trusted' && r.cap === 100; } },
    { name: 'case-07 score=50 应为 regular cap=20', fn: (f) => { const r = f(50); return r.tier === 'regular' && r.cap === 20; } },
    { name: 'case-07 score=49 应为 limited', fn: (f) => f(49).tier === 'limited' },
    { name: 'case-07 score=0 应为 limited cap=5', fn: (f) => { const r = f(0); return r.tier === 'limited' && r.cap === 5; } },
    { name: 'case-07 score=-1 应为 banned cap=0', fn: (f) => { const r = f(-1); return r.tier === 'banned' && r.cap === 0; } },
  ],
};
