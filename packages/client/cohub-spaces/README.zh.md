# @deepseek-ai/dsh-client-cohub-spaces

[English](README.md) | 中文

面向 `@deepseek-ai/dsh-client-remote-roots` 的浏览器侧 Cohub Provider。每个可访问 Space 都会成为带 `Cohub` 标识的文件夹式根，子项标识仍由 Provider 持有且保持不透明。所有操作都经过类型化 Host Remote 适配器，因此凭证不会进入本包或浏览器状态。

加载、账号变化后的刷新、迟到结果隔离、操作取消和 Provider 卸载都由这里负责。移除本插件只会撤下 Cohub 来源，不会移除通用文件树、改变本地 Workspace、修改 cwd 或创建 Shell 目标。

## 模型体验

无，因为这个浏览器侧 Provider 不注册提示词、工具或模型可见上下文。

#### KV Cache 影响

无。

## 已知限制与后续工作

- 通用文件树目前只呈现浏览能力。文本读写方法已留在能力接口中供后续编辑器使用；上传、移动、删除、同步和远端执行仍不支持。
