---
id: ADR-0002
title: 首期 MVP 范围限定为「消息条 P2P 直连」
status: accepted
date: 2025-08-25
owner: dongjiagoushi
decision: 首期 MVP 仅做「两节点 P2P 消息直连」（transport + session + identity + policy 四层最小可测代码基）
rationale: |
  分布式系统复杂度极高，首期聚焦最小闭环：
  - 消息条直连验证了「本地优先 + P2P + CRDT 收敛」核心假设
  - 四层最小可测代码基（packages/core）提供后续迭代的稳固地基
  - 独立质量验收（14 号测试报告）保障进入下一步的门禁
consequences: |
  - M1 阶段聚焦核心链路，不涉及分布式计算/内容分发
  - 后续 M2/M3/M4 依赖 M1 的接口契约
  - MVP 验收通过（CP2）后放行进入 M3 分布式计算
alternatives:
  - 全功能同时开发：风险过高，无法定位问题
refs: [04-工程实施方案, 14-测试报告]
---

# ADR-0002 · 首期 MVP 范围限定为「消息条 P2P 直连」
