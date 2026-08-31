# CNB 借鉴方案：《分布式交互》云端+本地协同

## 0．事实基础
CNB（cnb.cool）：.cnb.yml 以 docker.image/volumes/stages 定环境/缓存/步骤；另覆盖 commit-lint/Issue 模板/覆盖率/monorepo 构建（docs/cnb/）。云端 IDE/部署示例与 P2P 无关，不借鉴。

## 1．同源双环境
是什么：构建与开发环境由同一 .cnb.yml 声明、随代码版本化。痛点：M1 Node/Rust 混合环境漂移。落地：根 .cnb.yml 定 CI 环境，devcontainer.json 同源生成，版本唯一真源；缓存统一 .cache/。

## 2．MR+commit-lint
是什么：push/MR 触发流水线，commit-lint 按 .commitlintrc.yml 查提交规范。痛点：人眼挑提交。落地：merge_request 步骤 + .commitlintrc.yml，本地同规则，接入 standard.check。

## 3．模板沉淀
是什么：Issue/labels 模板、任务集看板把协作约定落成仓库文件。痛点：新任务粒度不一、约定靠人肉。落地：.cnb/ 落模板，对齐 label.*/issue.*，任务从模板生成。

## 4．委托授权模型
是什么：NPC 事件=Issue 评论 @提及，授权限时/限地/限权三元组。痛点：M3 算力贡献者授权与信任无模型。落地：三元组移植为委托令牌语义入联网策略；本地接力卡沿用限时/限地/限权交接。

## 5．证据上报
是什么：showcase 提供单测覆盖率上报并随流水线留档。痛点：CRDT 收敛无客观证据，CP2 靠口头。落地：convergence-sim 输出收敛轮数+覆盖率 JSON 留档，作 CP2 演示证据。

## 6．产物锚定
是什么：制品/commit 附件可回溯 commit 与平台。痛点：交付物说不清来源。落地：产物以 commit+hash 命名登记 release 账本 JSON，门禁全绿才入账。

## 7．冲突一：集中执行 vs 本地优先·自愿联网
CNB 门禁以推送远端为触发前提，等于把"联网"变成验证前提，与自愿联网直接抵触：断网开发永远拿不到通过态。界线：ci-local.ps1 为权威门禁，云端仅镜像复核、只报警不阻塞。

## 8．冲突二：信任边界不自洽
SaaS 使源码、日志、产物驻留腾讯云边界，策略不可控；卖点"数据不经中心"，工程链却中心化。约束：CI 仅跑合成数据与公开依赖，真实数据/密钥不进流水线；上报做成联网策略开关。
