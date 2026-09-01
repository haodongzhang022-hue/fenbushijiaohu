---
id: ADR-0006
title: 身份凭据用本地 Keystore 加密持久化
status: accepted
date: 2025-08-25
owner: dongjiagoushi
decision: Ed25519 密钥对 AES-256-GCM 加密持久化到本地 Keystore，PBKDF2 口令派生，支持 generate/unlock/lock/revoke
rationale: |
  - 本地优先原则：密钥不离开用户设备
  - 绑定长期身份：信誉分与治理依赖可信身份
  - 加密 at-rest：密钥不落地明文
  - 状态机：generated→locked→active→revoked
consequences: |
  - 需要 identity/keystore.js 模块
  - 口令遗忘将无法恢复密钥（无中心服务器）
  - 绑定长期身份支撑 M6 信誉累积
alternatives:
  - 中心化密钥管理：违背本地优先
  - 明文存储：不安全
refs: [16-M4bM5M6与传输层设计, packages/core/src/identity/keystore.js]
---

# ADR-0006 · 身份凭据用本地 Keystore 加密持久化
