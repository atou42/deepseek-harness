# @deepseek-ai/dsh-client-cohub-spaces

[English](README.md) | 中文

面向 `@deepseek-ai/dsh-client-remote-roots` 的浏览器侧 Cohub Provider。每个可访问 Space 都会成为带 `Cohub` 标识的远端根；展开后列出该 Space 内的 Cohub Session，而不是文件。选择远端根只会进入原生 Cohub Agent 会话；提交、轮询和取消的 Turn 都由 Cohub 持有。在这个云端输入框里输入 `@` 会搜索其他可访问的 Space，并插入 Cohub 的标准 `@[名称](cohub://spaces/id)` 引用。与此同时，本包把同一批 Space 注册为本地输入框可搜索的 `@` 引用，让普通 DSH Session 按需访问指定 Space 的云端资产；本地路径仍使用独立的工具上下文序列化。已有和新建的云端 Session 都使用不透明浏览器身份。凭证不会进入本包或浏览器状态。

加载、账号变化后的刷新、迟到结果隔离、Session 列表取消、消息块投影和 Provider 卸载都由这里负责。Provider 会在 Space I/O 前读取不含令牌的账号快照；匿名或尚未完成登录时发布非错误的 Cohub 待认证状态，登录后再由既有账号变化事件加载 Spaces。传输失败仍会明确显示为错误。移除本插件只会撤下 Cohub 来源；单独注册的本地 Workspace 仍是普通 DSH 状态。

## 模型体验

无，因为这个浏览器侧 Provider 只公开 Cohub 根与引用元数据，不会组装或修改模型请求。

#### KV Cache 影响

引用文本只在实际选择 Space 的轮次进入 prompt；稳定的工具 schema 由 Host 侧适配器提供。

## 已知限制与后续工作

- 原生交互目前接受文本 prompt，并轮询保留的 Turn 与流快照状态；输入框附件仍暂缓。Space 文件不会出现在导航里，本地 DSH Agent 通过 `@Cohub Space` 引用和限定范围的工具访问。
