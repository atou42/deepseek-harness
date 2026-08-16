# @deepseek-ai/dsh-cohub-spaces

[English](README.md) | 中文

Host 侧 Cohub Space 适配器。它只通过唯一的 `ctx.cohubAccount` 所有者取得访问令牌，校验平台返回的每一份数据，并提供类型化 Remote 方法，用于列出可访问 Space、完整读取分页 Session 和 Turn、执行相对目录树与文本文件操作、解析独立的本地 cwd 锚点，以及把 Space 绑定到一个仍为空白的 DSH Session。绑定会保留原本的 DSH Agent 与本地工具，再加入限定到该 Space 的目录读取、文件读取、版本校验写入和命令工具。Space 始终是远程语义根；本包不会把它的路径映射到本地文件系统，也不会运行同步循环或发布 Work。

实现直接调用 Cohub 平台 HTTP API，不依赖 Cohub CLI 或 SDK。Space、Session 与文件标识可以经过浏览器边界，账号凭证不会。Session 分页遇到重复游标、重复身份或跨 Space 数据时会明确失败，不会返回残缺列表；空 Session 标题是合法数据，浏览器会为它生成显示名称。文件版本会原样保留平台返回的毫秒时间戳（包括小数毫秒）和字节大小。二进制文件与 URL 交付文件会明确失败。过期版本写入会返回当前远端文本与版本，不会覆盖它。命令会在配置的时间范围内轮询 Cohub 任务，直到成功或失败。

## 配置

- `apiBaseUrl` 选择 Cohub HTTP 来源，默认使用账号包的平台来源。
- `localCwd` 选择与 Cohub 绑定 Session 配对的本地 DSH Workspace，默认使用 Host 进程工作目录，且必须是绝对路径。
- `runPollIntervalMs` 控制命令任务轮询间隔，范围为 100 到 10,000 毫秒，默认 1,000 毫秒。
- `runTimeoutMs` 限制单条命令总时长，范围为 1,000 到 3,600,000 毫秒，默认 120,000 毫秒。

## 模型体验

无全局影响，因为适配器不会修改全局模型配置；绑定只会在所选 DSH Agent 的作用域内注入一条可持久化的说明，并注册四个工具。Agent 原有的本地上下文与工具保持可用，因此一段 DSH 对话可以同时操作本地文件和已绑定的 Cohub Space。

#### KV Cache 影响

绑定说明和四个工具 schema 会为该 Session 的每次请求增加一小段稳定前缀。工具结果进入普通 DSH 历史，并遵循其压缩行为。

## 已知限制与后续工作

- 本适配器只处理已有 Space 目录树、内联 UTF-8 文本和有界的一次性命令。上传、删除、移动、持久终端、静默同步和 Work 发布不在契约内。
