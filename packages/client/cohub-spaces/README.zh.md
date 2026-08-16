# @deepseek-ai/dsh-client-cohub-spaces

[English](README.md) | 中文

面向 `@deepseek-ai/dsh-client-remote-roots` 的浏览器侧 Cohub Provider。每个可访问 Space 都会成为带 `Cohub` 标识的 DSH 工作根；展开后列出该 Space 内的 Cohub Session，而不是文件。选择 Space 会幂等注册 Host 提供的本地 cwd 作为本地 Workspace，在其中创建普通 DSH Session，通过 Host 适配器绑定 Space，并且只在绑定成功后打开 DSH 工作台。已有 Cohub Session 的历史通过不透明浏览器身份进入只读查看器。凭证不会进入本包或浏览器状态。

加载、账号变化后的刷新、迟到结果隔离、Session 列表取消和 Provider 卸载都由这里负责。Provider 会在 Space I/O 前读取不含令牌的账号快照；匿名或尚未完成登录时发布非错误的 Cohub 待认证状态，登录后再由既有账号变化事件加载 Spaces。传输失败仍会明确显示为错误。移除本插件只会撤下 Cohub 来源；单独注册的本地 Workspace 仍是普通 DSH 状态。

## 模型体验

无直接影响，因为这个浏览器包只会请求 Host 适配器绑定新建的 DSH Session。

#### KV Cache 影响

稳定的模型前缀和工具 schema 由 Host 侧绑定决定。

## 已知限制与后续工作

- Cohub Session 历史保持只读。新工作在绑定后的 DSH Session 中完成；Space 文件不会出现在导航里，只通过限定到该 Agent 的工具提供。
