# @deepseek-ai/dsh-cohub-spaces

[English](README.md) | 中文

Host 侧 Cohub Space 适配器。它只通过唯一的 `ctx.cohubAccount` 所有者取得访问令牌，校验平台返回的每一份数据，并提供类型化 Remote 方法，用于列出可访问 Space、完整读取分页 Session 和 Turn、提交和取消原生 Cohub Agent Turn，以及执行相对目录树、文本文件和命令操作。每个本地 DSH Agent 都会获得四个 Cohub 工具；普通会话必须从 `@Cohub Space` 引用取得明确的 `space_id`，旧版已绑定会话仍可省略该参数。Space 始终是远程语义根；本包不会把它的路径映射到本地文件系统，也不会运行同步循环或发布 Work。

实现直接调用 Cohub 平台 HTTP API，不依赖 Cohub CLI 或 SDK。Space、Session、Turn、模型与文件标识可以经过浏览器边界，账号凭证不会。原生 prompt 必须带调用方生成的 `clientMessageId`，可以携带经过校验的 Provider/模型组合与 Cohub 思考强度，并且只接受 Cohub 的即时 Session/Turn 响应；取消前会校验 Turn 的 Space 归属。Session 分页遇到重复游标、重复身份、损坏的标题类型或跨 Space 数据时会明确失败，不会返回残缺列表；空字符串或 null 的 Session 标题会作为无标题会话处理，由浏览器生成显示名称。文件版本会原样保留平台返回的毫秒时间戳（包括小数毫秒）和字节大小。二进制文件与 URL 交付文件会明确失败。过期版本写入会返回当前远端文本与版本，不会覆盖它。命令会在配置的时间范围内轮询 Cohub 任务，直到成功或失败。

## 配置

- `apiBaseUrl` 选择 Cohub HTTP 来源，默认使用账号包的平台来源。
- `localCwd` 选择与 Cohub 绑定 Session 配对的本地 DSH Workspace，默认使用 Host 进程工作目录，且必须是绝对路径。
- `runPollIntervalMs` 控制命令任务轮询间隔，范围为 100 到 10,000 毫秒，默认 1,000 毫秒。
- `runTimeoutMs` 限制单条命令总时长，范围为 1,000 到 3,600,000 毫秒，默认 120,000 毫秒。

## 模型体验

原生云端 Turn 会先校验 Cohub 模型目录，以及可选的 Provider/模型与思考强度覆盖值，再转发给 Cohub，不会自行发明默认值。本地 DSH Agent 保持不变，只会获得简短的 `@Cohub Space` 使用说明和四个云端工具。

#### KV Cache 影响

引用说明和四个工具 schema 会为本地 Session 的每次请求增加一小段稳定前缀。具体 Space 名称和 id 只在引用它的轮次出现；工具结果进入普通 DSH 历史，并遵循其压缩行为。

## 已知限制与后续工作

- 本适配器只处理已有 Space 目录树、内联 UTF-8 文本和有界的一次性命令。上传、删除、移动、持久终端、静默同步和 Work 发布不在契约内。
