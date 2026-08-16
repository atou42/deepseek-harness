# DSH × Cohub 插件生态 Goal 账本

[English](dsh-cohub-goal-ledger.md) | 中文

本文件是 DSH × Cohub 插件 Goal 的追加式长期状态。恢复工作前必须先读。确认事实、决策、实现、失败检查、验证证据、阻塞和下一步都应写入。账本本身不是完成证明，每项完成声明仍需指向当前仓库或运行证据。

## 2026-08-16 · 目标锁定与隔离基线

目标位于 Cohub Space `dec69421-9f80-46f7-80c4-7e09ca0c507f`。DSH 版本锁定为 `0.1.0-rc.5`，提交为 `47f943859bef60e4160492346772ded9b24f765a`。现有工作树 `/workspace/deepseek-harness`、所在分支、运行配置、用户数据和日常使用状态在本 Goal 中全程只读。所有写入、依赖安装、构建和测试只允许发生在分支 `cohub/dsh-plugin-ecosystem` 与工作树 `/workspace/dsh-cohub-plugins`，运行验证必须使用任务专属的 Harness 数据目录。本 Goal 不授权合并、不安装到现用 Profile、不发布 Work、不发版、不推送。

原工作树存在与本目标无关的未提交改动，其中包含早期基于 iframe 的 Cohub Board 实验，这些内容全部排除。隔离工作树曾因归档检出中断而不完整，现已修复，并在锁定提交上确认干净。自动研究基线为零项专用验收检查。

第一项实现决策是让远程根在结构上与本地 Workspace 分离。通用契约使用 Provider 自有的不透明根 ID 和节点 ID，并携带明确的云端、网络或外部标识。契约不包含本地路径、cwd、Shell、登录或 Cohub 名词。Cohub 只会是一个可独立卸载的来源。文件写入使用基于版本的比较后写入，版本冲突必须作为明确失败返回。

下一步是实现并验证通用远程根注册服务，再加入最小的侧栏显示扩展，不修改 Workspace 归属或 Session 导航。

