# 分布式交互 · fenbushijiaohu

> 让多个用户直接通讯、贡献算力聚合、内容（视频）传播，实现**话语权回归本地、自愿联网、跨平台跨游戏**的分布式体系。

## 现状
- 🏗 阶段：M0 架构框架（完成）+ M0.5 框架 v2 增量（80%）+ M1–M4b 全部落地
- 🚀 M1 消息条 MVP：`packages/core` 四层最小可测代码基已跑通（测试全绿）
- 🚀 M2 联网策略 / M2a 中继网格+容错 / M3 分布式计算 / M4 内容分发 全部已落地
- 🚀 M4b 分层存储+云端+115冷存：CloudSync + Archive115 已落地（PR #20/#21）
- 🚀 M5 游戏大厅 / M6 治理信誉 / 真实传输适配器 / 身份 Keystore 已落地（PR #22）
- 🧪 6 包 107 项测试全绿 + bug-bench 8 用例 22 断言全绿
- ⏸ 暂停点：CP3 安全审计已通过，待真实网络接入验证

## 架构文档
| 文档 | 说明 |
|------|------|
| [01-调研报告](docs/architecture/01-调研报告.md) | 需求拆解 + 参考实现 |
| [02-顶层架构拓扑](docs/architecture/02-顶层架构拓扑.md) | 架构图 + 6 层模块 |
| [03-可行性验证](docs/architecture/03-可行性验证.md) | 关键假设判定 |
| [03b-可行性实测记录](docs/architecture/03b-可行性实测记录.md) | F1–F9 逐条实测闭环 |
| [04-工程实施方案](docs/architecture/04-工程实施方案.md) | 目录 + 接口契约 + 契约矩阵 |
| [05-分工与协作规则](docs/architecture/05-分工与协作规则.md) | 角色协作表 |
| [06-进度对齐](docs/architecture/06-进度对齐.md) | 里程碑 + CP 确认点 |
| [07-索引](docs/architecture/07-索引.md) | 索引 + 二级信息视图 |
| [08-汇报与复盘](docs/architecture/08-汇报与复盘.md) | 决策 + 风险 + 复盘 |
| [09-审查补充与增强](docs/architecture/09-审查补充与增强.md) | 网络稳定性/中转加速/云端备份/信誉分/社区治理补强 |
| [10-八步交叉审查与新框架](docs/architecture/10-八步交叉审查与新框架.md) | 用架构八步体系对 M0 交叉审查，产出 v2 增量基线 |
| [11-风险登记簿](docs/architecture/11-风险登记簿.md) | 风险责任人/触发阈值/缓解/状态（R-001~R-013） |
| [12-整体架构分层设计](docs/architecture/12-整体架构分层设计.md) | 整体设计→粗纲→功能模块纲→细纲，四级粒度分阶段完善框架完整度 |
| [13-bug角色能力评测方案](docs/architecture/13-bug角色能力评测方案.md) | 验证专门解决 bug 的角色（带壳）能力是否优于基线 |
| [14-M1独立质量验收测试报告](docs/architecture/14-测试报告.md) | 测试专员对合并后 M1 代码基的独立验收测试矩阵/缺陷分级/信号灯 |
| [15-安全审计报告](docs/architecture/15-安全审计报告-M2M3M4.md) | 安全审核官对 M2/M2a/M3/M4 代码基的 OWASP 审计 |
| [16-M4b/M5/M6与传输层设计](docs/architecture/16-M4bM5M6与传输层设计.md) | L3 细纲下钻：可编码契约 |
| [ADR 决策记录](docs/architecture/adr/) | 架构决策留痕（ADR-0001~0006） |

## 跨仓库协作
| 文档 | 说明 |
|------|------|
| [跨仓库架构师调度规则](docs/协作/跨仓库架构师调度规则.md) | 跨项目调度架构师的描述规范：仓库路径+角色名+上下文 |

## 代码基（6 包 + 评测台）
| 包 | 说明 | 测试 |
|----|------|------|
| `packages/core` | M1 消息条 + 传输适配器（WebRTC/libp2p）+ Keystore | 全绿 |
| `packages/net-policy` | M2 联网策略（policy 增强 + relay NAT 兜底） | 全绿 |
| `packages/relay-mesh` | M2a 中继网格+容错（health/failover/mesh/multipath） | 全绿 |
| `packages/compute` | M3 分布式计算 + M6 治理信誉（Compute/Verify/Reputation/Governance） | 全绿 |
| `packages/content` | M4 内容分发 + M4b 云端同步/冷存归档（Content/Storage/CloudSync/Archive115） | 全绿 |
| `packages/app` | M5 游戏大厅 + 联邦协议（Lobby/Fed） | 全绿 |
| `bug-bench` | bug 角色能力评测台（8 用例 22 断言） | 全绿 |

## 核心能力
1. **点对点消息直连**（消息条）
2. **分布式计算聚合**（算力/带宽贡献者）
3. **内容传播**（尤其视频）
4. **低延迟游戏大厅**（跨游戏连线）
5. **话语权回归**（本地优先 + 自愿联网 + 跨平台）
