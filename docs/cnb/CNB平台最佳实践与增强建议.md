# CNB 平台最佳实践调研与增强建议

> 来源：https://cnb.cool/examples/showcase（官方 showcase 完整示例仓库，100+ 示例）
> 配套文档：https://docs.cnb.cool/zh/（含 llms.txt LLM 可读索引）
> 状态：调研完成（2026-08 整理）
> 用途：为《分布式交互·fenbushijiaohu》「云端+本地协同」体系提供借鉴依据；配套 skill：cnbzengqiang

---

## 1. CNB 平台是什么

腾讯云 Cloud Native Build：**「Everything as code」的云原生研发平台**，一体化能力 = 代码托管 + 云原生构建(CI/CD) + 云原生开发(云端 IDE) + 制品库 + AI 助手(NPC) + 安全扫描 + 任务集(看板)。

核心抽象三件套（全部基于 Docker 生态）：
1. **构建环境 = Docker 镜像**：`docker.image` 指定，杜绝环境漂移
2. **缓存 = 声明式卷**：`volumes: - /root/.npm:copy-on-write`（写时复制，并发安全）；跨节点用 `docker:cache` 内置任务把缓存打成镜像
3. **插件 = Docker 镜像**：`image: cnbcool/hello-world` 即一个可复用构建步骤

一句话理念：**声明式、与代码同源、版本可追溯、资源池化**。

## 2. showcase 最佳实践全景（分类清单）

### 2.1 编程语言示例（99% 自带「构建环境 + 开发环境」双配置）
| 场景 | 示例 | 要点 |
|------|------|------|
| Spring Boot 出镜像 | springboot-gradle/maven-docker | 构建镜像推送 CNB 制品库 |
| Spring Boot SSH 部署 | springboot-maven-ssh | jar 包 SSH 部署 |
| 内网部署 | springboot-maven-docker-jumpserver | 镜像 + JumpServer 跳板机部署内网 |
| 静态站 → 云存储 | vue/react-cos-demo | 静态资源上传腾讯云 COS |
| 静态站 → 服务器 | react-ssh-demo、hexo-rsync-remote | SSH / rsync 部署 |
| 全栈 | nextjs / react-docker / node-express-docker | 镜像 → 制品库 → CVM |
| Go | go-gin-kubernetes / golang-build | 制品库 + K8S；纯构建 |
| 私有依赖 | go-private-repo-server | 构建时拉私有仓库/模块 |
| 容器编排 | nodejs-docker-compose（MySQL+Redis）、.NET Core 同款 | docker compose 联调 |
| 移动/语言 | android-demo、r-build、python-flask-docker | 多语言覆盖 |
| 云开发持久化 | endstages + COS | **云开发环境的数据库/文件持久化**（重难点） |
| 多架构 | go 多架构镜像 | amd64/arm64 多平台附件 |
| 科学计算 | conda+snakemake+Rstudio（生物信息学） | 镜像内置全套环境 |

### 2.2 Issue/PR 协同最佳实践
- **Issue 通知群聊**（issue-notice）、**CR 评审通知企业微信**（code-review-notice）
- **Issue 模板**（examples/templates/issue-templates）
- **PR 内 commit 规范检查**（commit-lint，配 .commitlintrc.yml）
- **PR 内 AI 代码评审**（code-review）
- **标签模板**：中大型项目 / 小型项目两套（.cnb/labels）
- **任务集**（自定义看板，mission-templates）

### 2.3 云原生构建进阶
- YAML 语法进阶（you-dont-konw-cnb-yaml：常见坑合集）
- 自定义按钮**手动触发**构建（custom-button）
- **API 触发**流水线（api-trigger-pipeline）
- **缓存提速**（use-cache）
- **include + reference 复用**配置（include-with-reference）
- 定时任务：域名证书检查（domain-cert-check）、定时拉代码自动构建 Release
- 子目录 Dockerfile 构建（docker-build-with-by）
- 插件 Dockerfile 声明 settings-from
- 简化配置文件、文件引用、流水线可视化
- Monorepo 按需构建
- 多环境部署配置（**含审批流**）

### 2.4 云原生开发（云端 IDE/环境）
- 自定义开发环境（custom-vscode）、vsx 插件安装、前端沙箱一键预览（code-sandbox-in-cnb）
- 中文插件配置（chinese-env）、多系统原生环境整合
- Dify / N8N / 云原生桌面 / JetBrains IDE / devcontainer
- **仅预览模式**（beta：jupyter 预览、hunyuan 生图预览）

### 2.5 制品上传
- Docker：CNB 制品库 / Docker Hub / TCR（腾讯云容器镜像服务）
- **buildx 多架构（amd64/arm64）**：方案 1（推荐）vs 方案 2
- 二进制附件：golang → release 附件 / commit 附件 / 多平台（Win/Linux/Mac）附件
- 制品库类型：Docker、Helm、Maven、npm、ohpm、NuGet、Composer、PyPI、Cargo、Conan、Docker Model（AI 模型）

### 2.6 部署场景
- 多环境部署（审批流）、ansible CVM、Terraform 集群
- TKE 更新 Deployment 镜像（插件）、EdgeOne Pages 自动化部署、Helm → K8S
- TCB 云托管 / 静态托管、微信云托管
- **CVM 远程命令（无需暴露公网 IP 与密码）**

### 2.7 AI（CodeBuddy NPC）
- 代码变更自动生成 codewiki 文档
- GitHub Actions 语法 → CNB 语法转换（迁移文档）
- NPC 生态：NPC Playground、创建 NPC、各领域 NPC（图表/办公/图片/TTS 助手）

### 2.8 插件制作
- hello world 插件、自制插件市场（plugin-market）

### 2.9 超大仓库
- **125GB AOSP**：读秒克隆（git-clone-yyds OverlayFS）+ Volumes 缓存 + 远程开发

### 2.10 配套工具
- 代码迁移 / 制品迁移 / CODING Generic → Release / CODING 事项导入 TAPD
- 从 CNB 同步到其他 Git 平台 / GitHub workflow 迁移 .cnb.yml
- 在线使用镜像 cnbcool/default-dev-env；腾讯云软件源（Maven/Gradle/NPM/Ubuntu/Debian/Alpine/Python/PHP）
- 单测覆盖率上报（node / go）

## 3. 关键机制速查（来自文档 llms.txt / build intro / NPC / Skills）

### 3.1 .cnb.yml 语法骨架
```yaml
main:            # 事件：push / merge_request / tag / schedule / api 等
  push:          # 分支过滤
    - docker:            # 构建环境（可省略让系统识别）
        image: node:20
      volumes:           # 声明式缓存（copy-on-write 并发安全）
        - /root/.npm:copy-on-write
      stages:            # 步骤；每步可独立换镜像
        - node -v
        - npm install
        - npm test
      runner:
        cpus: 64         # 弹性算力，最高 64 核
$:               # 云原生开发环境（同一文件声明开发环境！）
  vscode:
    - docker:
        image: node:20
      services:
        - vscode
      volumes:
        - node_modules:copy-on-write
      stages:
        - npm install
```

### 3.2 NPC 委托代理模型（AI 自动干活的安全模型）
- 三层：**当事人**（@ 的人）→ **代理人**（NPC）→ **代理权**（三重约束：限时-仅本次任务 / 限地-仅当前仓库 / 限权-角色上限+scope 收窄）
- 事件触发：`issue.comment@npc` / `pull_request.comment@npc`（评论里 @CodeBuddy）
- 默认只能读+评论；勾选「**替我上班**」工作模式后：写代码、推分支、发 PR、按评审改、闭环 Issue
- 身份令牌 CNB_TOKEN 随流水线注入；组织可开关「允许 NPC 跨仓操作」
- **交付方式约定（CODEBUDDY.md）**：上班模式 → 自动提交+PR；无写权限 → 源码 zip 打包上传 Issue 评论区（`cnb issues upload-file` + `cnb issues comment`），免构建
- 自定义 NPC：仓库 .cnb/settings.yml 里定义角色（name/prompt），@仓库路径(角色名) 使用

### 3.3 CNB Skills（AI 技能机制）
- 官方 Skills 仓库 cnb/skills：基于 OpenAPI 的能力集（仓库/Issue/PR/Git/评审/流水线/构建日志/制品/组织）
- NPC 运行时镜像安装：`npm i -g @cnbcool/cnb-cli` + `npx skills add https://cnb.cool/cnb/skills/cnb-skill.git -g -y`
- **自定义 Skill = 目录 + SKILL.md**，放 `.codebuddy/skills/<name>/SKILL.md`，NPC 自动识别加载
- CNB CLI 就是全部 OpenAPI 的壳；另有 OpenAPI 文档、徽章（pipeline-as-code / auto_merge 状态徽章）

### 3.4 其他
- 安全扫描：code_scan_config.yml；SCA 插件（开源漏洞 / License / SBOM），PR 阶段增量
- 密钥仓库（高安全等级，禁本地克隆）；GPG 提交签名验证；角色权限 5 级（访客/助手/开发者/管理员/负责人）
- 迁移：GitHub Actions → CNB 有官方迁移指南；CODING → CNB 全套工具
- 效率细节：git-clone-yyds（OverlayFS 秒级克隆 100GB+）、runner.cpus 弹性、跨节点 docker:cache

## 4. 对《分布式交互》体系的增强建议（云端+本地协同）

> 项目定位：**本地优先、自愿联网、话语权回归**的 P2P 分布式体系（WebRTC 消息条 M1 → 算力聚合 M3 → 视频分发 M4 → 游戏大厅 M5）。CNB 是**云端集中式**平台——不做思想搬运，做**镜像式借鉴**：

### 4.1 直接可借鉴（复制→改造成本地栈）
| # | CNB 实践 | 我们怎么用 | 落地位置 |
|---|---------|-----------|---------|
| 1 | 环境即声明（docker 镜像/卷/插件全声明式） | 本地采用 devcontainer / nix 声明统一开发环境，构建环境进 spec | M1 起 packages/* 配 devcontainer |
| 2 | copy-on-write 缓存卷 + docker:cache 打镜像 | CRDT/消息载荷缓存用写时复制语义；构建缓存进 ci 镜像 | M1 core |
| 3 | git-clone-yyds OverFS 秒级克隆 | 本地 git 大仓库/镜像仓库加速（配合本地 relay 镜像） | 基建 |
| 4 | Issue/PR 协同闭环（模板/标签/commit-lint/AI 评审/通知） | 直接套用到我们已有 issues/*.md 工作流 + 团队接力卡 | 项目治理（本周就可用） |
| 5 | 多环境部署含审批流 | 本地/局域网/公网三态发布用同一份声明+审批门禁（呼应 M2 联网策略） | M2 policy |
| 6 | NPC 委托代理模型（限时/限地/限权） | 我们「自愿联网贡献算力」的节点授权模型直接借鉴三重约束 → 防恶意节点 | M3 compute/trust |
| 7 | 制品库 + 多架构 + 附件 | 本地节点产物/模型/二进制用 OCI 制品语义分发（可中继） | M4 content |
| 8 | 定时任务/API 触发/手动按钮 | 本地 daemon 的 job 调度语义统一（cron + webhook + 手动） | 基建 |

### 4.2 思路借鉴（不抄实现）
- **Everything as code**：我们的一切（拓扑/策略/任务）也应声明式入库、版本可追溯 → 呼应本项目 issues/接力卡体系
- **委托代理**：本地 Agent 替主人干活时同样需要「限时限地限权」——这是 M3 信任策略的第一课
- **交付方式**：云端无写权限时 zip+Issue 交付（CODEBUDDY.md 模式）→ 本地场景 = 「离线交付包 + 签名」语义

### 4.3 不适用的（明确排除）
- 云端集中式 CI 集群/托管 → 与本地优先冲突，仅作可选「自愿多云中继」之一
- 平台绑定（TAPD/企业微信群/COS/CVM 强绑定的示例）→ 只取模式不取账号体系
- 仅预览模式/云端 IDE → 本地工具链优先，云 IDE 仅当自愿使用时提供

## 5. 链接索引
- Showcase 主仓：https://cnb.cool/examples/showcase（README 即全清单）
- 生态示例组：https://cnb.cool/examples/ecosystem/*（各语言/场景）
- 文档（LLM 友好）：https://docs.cnb.cool/zh/llms.txt 、 https://docs.cnb.cool/zh/llms-full.txt
- NPC 文档：https://docs.cnb.cool/zh/build/npc.html ；Skills 文档：https://docs.cnb.cool/zh/develops/skills.html
- 官方 Skills 仓库：https://cnb.cool/cnb/skills/cnb-skill
- CNB CLI：@cnbcool/cnb-cli
