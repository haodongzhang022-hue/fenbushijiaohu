# bug-bench · 专门解决 bug 的角色能力评测集

> 目的：客观测量「专门解决 bug 的角色」（带「评审-修复闭环护栏」壳）的
> 修复能力，并与基线（DeepSeek v4 flash / 外部 CodeBuddy）对比，
> 验证「壳」是否真的生效。

## 快速开始

```bash
# 运行全部评测用例（信号灯）
node bug-bench/run.js

# 运行单个用例
node bug-bench/run.js --case case-01

# 输出对比报告模板
node bug-bench/run.js --report
```

## 评测用例一览

| 用例 | 模块 | bug 类型 | 期望 | 状态 |
|------|------|---------|------|------|
| case-01 | session | Lamport 时钟未推进 | 因果序严格递增 | ❌ 红灯 |
| case-02 | identity | 验签异常被放行 | 非法公钥必须拒绝 | ❌ 红灯 |
| case-03 | policy | 联网策略判断反了 | offline 禁广播/禁中继 | ❌ 红灯 |
| case-04 | transport | 空消息漏投递 | 空消息必达 | ❌ 红灯 |
| case-05 | session | 消息类型校验缺失 | 非法类型必须拒绝 | ❌ 红灯 |

> 初始通过率 ≈ 25%（仅"正确路径"用例通过）。每个用例的 bug 都真实存在，
> 修复对应 `cases/<id>/buggy.js` 后重跑 `run.js`，通过率应提升至 100%。

## 如何用于验证「壳」是否生效

1. **基线测量**：把同一批 `buggy.js` 交给基线（DeepSeek v4 flash / 外部 CodeBuddy）修复，
   记录修复通过率与轮次。
2. **被测测量**：把同一批 `buggy.js` 交给「专门解决 bug 的角色」（带壳）修复，
   记录修复通过率与轮次。
3. **对比判定**：带壳角色通过率显著高于基线、且轮次更少 → 壳生效；
   持平或更低 → 壳未产生增益。
4. **壳机制核对**：逐项检查带壳角色是否遵守「默认直接改 / 10 轮护栏 / 钩子没 bug 就停」。

> 完整方案见 `docs/architecture/13-bug角色能力评测方案.md`。
