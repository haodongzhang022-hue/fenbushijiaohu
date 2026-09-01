---
id: ADR-0002
title: 首期 MVP 范围：消息条 P2P 直连
status: accepted
date: 2025-06
deciders: zhongguoliandanshidongdong, dongjiagoushi
---

# ADR-0002 · 首期 MVP 范围：消息条 P2P 直连

## 背景
系统能力全景覆盖 C1–C5（消息直连/分布式计算/内容分发/游戏大厅/话语权回归）。首期需要选定最小可验证产物（MVP），在可控风险内跑通端到端闭环。

## 选项
1. **消息条 P2P 直连**（C1：两用户直接通讯）
2. 游戏大厅跨游戏连线（C4）
3. 分布式计算聚合（C2）

## 决策
**首期聚焦消息条 P2P 直连（C1）**，对应 transport + session + identity + policy 四层 MVP。

## 理由
- F1/F3/F8（P2P 直连、CRDT 收敛、本地优先）已判定低风险高价值，可直接落地。
- 消息直连是其他能力（计算/内容/大厅）的基础通路，先打通最小闭环成本最低。
- 参考实现（WebRTC/libp2p/CRDT）成熟，无需从零造轮子。

## 否决项
- 游戏大厅依赖跨平台适配，前置基础设施复杂，不适合首期。
- 分布式计算依赖多节点协作，首期验证成本高。

## 影响
- M1 交付物为 `packages/core` 四层最小可测代码基。
- CP1 批准后进入 M1 编码；M2/M2a/M3/M4 按后续里程碑推进。
