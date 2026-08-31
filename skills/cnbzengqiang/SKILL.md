---
name: cnbzengqiang
description: Use when 需要借鉴/引用腾讯云 CNB（Cloud Native Build, cnb.cool）平台最佳实践来增强「本地优先、云端协同、分布式/去中心化」类项目，或需要准确说出 CNB 的能力与术语（.cnb.yml、pipeline-as-code、声明式缓存、docker 插件、云原生开发、制品库、NPC 委托代理、替我上班/工作模式、CNB_TOKEN、CNB Skills、迁移工具）而不编造。触发词：CNB/cnb.cool/云原生构建/CodeBuddy/NPC/showcase/Everything as code/借鉴云端 CI CD 实践。
---

# cnbzengqiang · CNB 平台最佳实践增强

## Overview
CNB（Cloud Native Build，腾讯云 cnb.cool）是「Everything as code」的一体化研发平台：代码托管 + 云原生构建 + 云原生开发 + 制品库 + AI 助手(NPC) + 安全扫描 + 任务集。本 skill 提供其官方 showcase 最佳实践的**准确能力清单**、关键机制速查与「借鉴到本地/分布式体系」的增强映射方法。**核心原则：只引用本 skill 清单内的真实能力，不编造 CNB 不存在的特性；借鉴模式而非搬运平台。**

## When to Use
- 需要为多云/本地优先/分布式协同项目设计增强方案、对标 CNB 能力时
- 需要引用 CNB 的示例、术语、配置写法（.cnb.yml / NPC / 制品库 / 迁移）时
- 需要把 GitHub Actions / 自建 CI 迁移到 CNB 语法或反向借鉴时
- 需要在汇报中准确描述 CNB 平台能力时

**不要用于**：把项目整体迁移绑定到 CNB SaaS（那是平台运营决策，不是工程增强）；编造 CNB API 细节（去 OpenAPI 文档查）。

## 能力地图（先对表，再答题）
1. **云原生构建**：声明式 .cnb.yml + Docker 镜像环境 + copy-on-write 缓存卷 + docker:cache 跨节点缓存 + 插件即镜像 + runner.cpus 弹性(≤64核) + git-clone-yyds 秒级克隆(100GB+ 仓库) + include/reference/settings-from 配置复用 + 定时/API/手动触发 + 多环境部署(含审批流)
2. **云原生开发**：同 .cnb.yml 顶部「$」节点声明开发环境（vscode/services）→ branch-as-environment；自定义镜像/devcontainer/JetBrains/vsx 插件；预览模式(beta)
3. **代码托管**：Issue 模板(.cnb/ISSUE_TEMPLATE)、标签模板、.cnb/settings.yml UI/NPC 定制、commit lint + AI 评审、分支保护、密钥仓库、GPG 签名、元数据注解
4. **制品库**：Docker/Helm/Maven/npm/ohpm/NuGet/Composer/PyPI/Cargo/Conan/Docker Model(AI 模型)；二进制附件(release/commit)；buildx 多架构
5. **AI/NPC**：@CodeBuddy 事件触发(issue.comment@npc / pull_request.comment@npc)；委托代理模型(当事人→代理人→代理权：限时/限地/限权)；「替我上班」工作模式 = 写码+推分支+发 PR+按评审修改；CNB_TOKEN 三重约束令牌；自定义 NPC(.cnb/settings.yml)；CODEBUDDY.md 交付约定(无权限时 zip 打包上传 Issue 评论区，cnb issues upload-file/comment)
6. **安全**：code_scan_config.yml 扫描配置 + SCA 插件(漏洞/License/SBOM，PR 阶段增量)
7. **协同治理**：任务集(看板)、Issue→群聊/企微通知、AI codewiki
8. **迁移**：GitHub Actions→CNB 官方迁移指南；CODING→CNB 全套；跨平台同步工具
9. **开发者**：OpenAPI、cnb CLI(@cnbcool/cnb-cli)、Skills（cnb/skills 官方仓库；自定义 = 目录+SKILL.md 放 .codebuddy/skills/）、徽章(pipeline-as-code/auto_merge/status)

## 关键机制速查

### .cnb.yml 骨架（可直接给示例）
    # 构建流水线 = main 事件 + docker 环境 + volumes 缓存 + stages 步骤
    main:
      push:
        - docker:
            image: node:20
          volumes:            # 声明式缓存，copy-on-write 并发安全
            - /root/.npm:copy-on-write
          stages:
            - node -v
            - npm install
          runner:
            cpus: 16          # 弹性算力，最高 64 核
    $:                        # 同文件声明云原生开发环境
      vscode:
        - docker:
            image: node:20
          services: [vscode]
          volumes:
            - node_modules:copy-on-write
          stages: [npm install]

### NPC 委托代理模型（向分布式体系移植时的核心借鉴）
- 授权三元组：**限时**(仅本次任务) / **限地**(仅当前仓库，可开跨仓但限根组织) / **限权**(角色上限+scope 收窄)
- 事件 = 评论 @ 提及（issue.comment@npc / pull_request.comment@npc）；一次最多 10 个 NPC 事件
- 工作模式：勾选「替我上班」后 NPC 可写码+推分支+发 PR+按评审修改；需仓库 Developer 及以上权限
- 交付：能推 PR 走正常流程；不能(只读仓库)→ 打包源码 zip 上传 Issue 评论，附下载链接（cnb issues upload-file / cnb issues comment 已预装）
- 自定义 NPC：仓库 .cnb/settings.yml 定义角色（name/prompt），@仓库路径(角色名) 使用；默认环境 cnbcool/default-npc:latest

### 借鉴到「本地优先/自愿联网」体系的增强映射模板
| 本地体系痛点 | CNB 借鉴点 | 落地形态 |
|---|---|---|
| 环境漂移/多人不一致 | 环境即声明(镜像/卷/插件) | devcontainer/nix 声明入库 |
| 节点授权不可信 | NPC 限时/限地/限权 | 贡献算力的委托令牌(呼应信任策略) |
| 构建/缓存慢 | copy-on-write + docker:cache | 本地缓存写时复制语义 |
| 多态网络切换 | 多环境部署+审批流 | 本地/局域网/公网三态发布声明 |
| 交付难 | CODEBUDDY.md 无权限交付 | 离线交付包+签名 |
| 治理散乱 | Issue 模板/标签/commit-lint/AI 评审/任务集 | 套用既有 issues/接力卡体系 |

## Showcase 索引（引用示例时用真实链接）
- 总仓：https://cnb.cool/examples/showcase （README = 全清单）
- 生态组：https://cnb.cool/examples/ecosystem/（springboot-*-docker、*-cos-demo、*-ssh-demo、go-gin-kubernetes、nodejs-docker-compose、use-cache、include-with-reference、api-trigger-pipeline、custom-button、you-dont-konw-cnb-yaml、chinese-env、custom-vscode、code-sandbox-in-cnb、docker-build-with-by、settings-from 等 70+ 示例）
- 模板：templates/issue-templates、mission-templates
- 文档(LLM 友好)：https://docs.cnb.cool/zh/llms.txt ；NPC：/zh/build/npc.html ；Skills：/zh/develops/skills.html
- 官方 Skills 仓库：https://cnb.cool/cnb/skills/cnb-skill

## Common Mistakes（常见错误与纠正）
| 错误 | 纠正 |
|---|---|
| 说 CNB 只有 CI/CD | 它是 托管+构建+云开发+制品+AI+安全+任务集 一体化 |
| 编造「CNB 的 K8s 托管/Serverless 托管」等 | 部署是示例(Helm/TKE/TCB/EdgeOne/CVM 脚本)，不是平台内置托管——先查能力地图 |
| 以为 NPC 必须开工作模式才能干活 | 默认可读+评论；工作模式才可写码推 PR |
| 混淆 CNB_TOKEN 权限 | 三重约束：限时/限地/限权；跨仓需组织开关且限根组织 |
| 把「云开发持久化」说成内置 | 是示例模式：endstages + COS 实现持久化(官方示例) |
| 照搬云端集中式 CI 到本地优先项目 | 只借鉴声明/缓存/授权模式，不绑定平台 |
| 编造 include/import 语法细节 | 配置复用关键字：include、reference、settings-from、imports、optionsFrom——细节查文档 |

## 借鉴输出前必查（RED 基线教训：无此清单时 agent 术语自造、漏掉 NPC 模型）
1. **术语用官方名**：禁止自造标签（如同源双环境/缓存即代码/MR+commit-lint）——正确说法：环境即声明、声明式缓存(copy-on-write)、merge_request 事件 + commit-lint、Issue/标签模板、覆盖率上报、产物附件锚定
2. **必须评估 NPC 委托代理模型**（限时/限地/限权三元组 + 替我上班工作模式）：对任何分布式/多参与者体系的信任与授权设计，它都是第一候选借鉴点；评估后不采用要写明理由
3. **必须给官方示例锚点**：引用 showcase 时带真实链接（https://cnb.cool/examples/ecosystem/<name> 或 docs.cnb.cool 文档页）
4. **部署说「部署示例」**：CNB 不内置托管（K8s/TKE/TCB/EdgeOne/CVM 均为示例脚本），不要误称平台内置能力
5. **明确不借鉴清单**：云端集中式 CI 集群、平台绑定账号体系(企微/TAPD/COS/CVM 强绑) 、云端 IDE 依赖——至少列 2 个不适用点
6. **映射要落到文件级**：每个借鉴点给出具体落地文件/配置/流程（如 .cnb.yml 骨架、devcontainer.json、convergence-sim 证据 JSON、release 账本）

## Real-World Impact
本项目《分布式交互》(E:/CNBcool) 已基于本清单产出 docs/cnb/CNB平台最佳实践与增强建议.md：8 项直接借鉴(环境声明/写时复制缓存/秒级克隆/Issue-PR 闭环/多环境审批流/NPC 授权模型/OCI 制品/任务调度)、2 项思路借鉴(Everything as code、离线交付)、3 项明确排除(云集中 CI、平台绑定、云 IDE 依赖)。
