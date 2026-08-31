# CNB 借鉴对照建议（《分布式交互》M1 前）

> 依据 cnbzengqiang skill 清单，只借模式：7 项借鉴 + 2 项冲突。

### 1｜环境即声明
CNB：.cnb.yml 用 docker.image 定构建环境、$ 节点定云开发环境、volumes 定缓存卷。痛点：M1 双端 Node+Rust 环境漂移。落地：devcontainer.json 与根 .cnb.yml 同源；ci-local.ps1 共用声明跑门禁。

### 2｜声明式缓存
CNB：volumes 为 copy-on-write 缓存卷，跨节点用 docker:cache 打镜像复用。痛点：npm/原生依赖反复拉取。落地：本地 .cache 挂载与 .cnb.yml volumes 同声明，依赖预构建成镜像。

### 3｜秒级克隆
CNB：git-clone-yyds 的 AOSP 示例以 OverlayFS + 卷缓存实现 125GB 仓库读秒克隆。痛点：M4 素材库大、同步慢。落地：克隆层与数据层分离，缓存层可重建、不入备份。

### 4｜pipeline-as-code 门禁
CNB：push/MR 触发流水线；commit-lint 按 .commitlintrc.yml 校验；AI 评审。痛点：M1 评审靠人眼、规范无强制。落地：.cnb.yml 加 MR 步骤 +.commitlintrc.yml，本地钩子进 standard.check。

### 5｜配置复用
CNB：include/reference/settings-from 复用公共配置段。痛点：多模块流水线重复、改一处漏多处。落地：公共段提为引用文件，本地抽公共脚本统一维护。

### 6｜NPC 委托代理
CNB：NPC 事件驱动（issue.comment@npc），授权三元组限时/限地/限权 + CNB_TOKEN，开「替我上班」才推 PR。痛点：M3 算力聚合、M5 大厅节点委托无信任模型。落地：三元组移植为本地委托令牌，票据限时限权。

### 7｜证据与产物锚定
CNB：单测覆盖率上报流水线留档；制品/release 附件回溯 commit。痛点：CRDT 收敛无客观证据，CP2 演示靠口头。落地：convergence-sim 输出收敛轮数 JSON 留档；产物 commit+hash 命名入账。

### 8｜冲突一：集中执行 vs 自愿联网
CNB 门禁以推送远端为触发前提，联网成为取得验证的前提，断网/私有开发拿不到通过态，抵触自愿联网。界线：本地 ci-local.ps1 为权威门禁，云端仅复核、只报警不阻塞。

### 9｜冲突二：信任边界不自洽
SaaS 使源码/日志/产物驻留腾讯云边界，「数据不经中心」卖点与工程中心化矛盾；云端 IDE/托管与 P2P 无关。约束：CI 仅跑合成数据与公开依赖，真实消息/密钥不进流水线，上报做开关。


> 来源：https://cnb.cool/examples/showcase
