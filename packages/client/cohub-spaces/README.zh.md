# @deepseek-ai/dsh-client-cohub-spaces

[English](README.md) | 中文

面向 `@deepseek-ai/dsh-client-remote-roots` 的浏览器侧 Cohub Provider。每个可访问 Space 都会成为带 `Cohub` 标识的可对话远程根；展开后列出该 Space 内的 Cohub Session，而不是文件。它通过不透明的浏览器身份映射 Session 历史和消息提交，也支持首条消息创建 Session。所有操作都经过类型化 Host Remote 适配器，因此凭证不会进入本包或浏览器状态。

加载、账号变化后的刷新、迟到结果隔离、Session 列表取消和 Provider 卸载都由这里负责。Provider 会在 Space I/O 前读取不含令牌的账号快照；匿名或尚未完成登录时发布非错误的 Cohub 待认证状态，登录后再由既有账号变化事件加载 Spaces。传输失败仍会明确显示为错误。移除本插件只会撤下 Cohub 来源，不会移除通用列表、改变本地 Workspace、修改 cwd 或创建 Shell 目标。

## 模型体验

无，因为这个浏览器侧 Provider 不注册提示词、工具或模型可见上下文。

#### KV Cache 影响

无。

## 已知限制与后续工作

- 当前界面会列出 Session，但还不能打开它的 Turn 历史或发送后续消息。这些属于独立的 Cohub 会话能力；Space 导航有意不展示文件。
