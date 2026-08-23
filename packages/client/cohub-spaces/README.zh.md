# @deepseek-ai/dsh-client-cohub-spaces

[English](README.md) | 中文

面向 `@deepseek-ai/dsh-client-remote-roots` 的浏览器侧 Cohub Provider。每个可访问 Space 都会成为带 `Cohub` 标识的远端根；展开后列出该 Space 内的 Cohub Session，而不是文件。Provider 提供两个独立操作：原生 Cohub Agent 会话提交、轮询并取消由 Cohub 持有的 Turn；本地 DSH 启动则把 Host 提供的 cwd 注册为 Workspace，创建普通 DSH Session，并在打开前绑定 Space。已有和新建的云端 Session 都使用不透明浏览器身份。凭证不会进入本包或浏览器状态。

加载、账号变化后的刷新、迟到结果隔离、Session 列表取消和 Provider 卸载都由这里负责。Provider 会在 Space I/O 前读取不含令牌的账号快照；匿名或尚未完成登录时发布非错误的 Cohub 待认证状态，登录后再由既有账号变化事件加载 Spaces。传输失败仍会明确显示为错误。移除本插件只会撤下 Cohub 来源；单独注册的本地 Workspace 仍是普通 DSH 状态。

## 模型体验

无直接影响，因为这个浏览器包只会请求 Host 适配器绑定新建的 DSH Session。

#### KV Cache 影响

稳定的模型前缀和工具 schema 由 Host 侧绑定决定。

## 已知限制与后续工作

- 原生交互目前接受文本 prompt，并轮询保留的 Turn 状态；Provider 附件和详细 Cohub 工具进度投影暂缓。Space 文件不会出现在导航里，另行选择的本地 DSH Agent 可通过限定范围的工具访问。
