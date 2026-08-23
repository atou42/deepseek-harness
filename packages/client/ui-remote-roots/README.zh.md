# @deepseek-ai/dsh-client-ui-remote-roots

[English](README.md) | 中文

面向 DSH 的匿名、与供应方无关的远程根和会话界面。它把带来源标记的远程根放在本地 Workspace 旁边显示，并保持所有 Provider 身份不透明。远端根只提供 Provider 云端会话操作；Provider Session 行会让该会话接管 DSH 原生中栏，而不是打开抽屉。可交互来源会使用熟悉的页头、对话、输入框、模型与思考强度控件，并提供近实时轮询和取消控制。结构化思考与工具活动使用 DSH 风格的展开行、实时状态动效、可展开详情和末尾跟随行为。新建或打开本地 Session 时会先退出远端界面，包括“新会话”复用已有空 Session 的情况。本包不会从远端根创建本地 DSH 会话，也不会创建账号、凭据或虚构本地路径。

供应方通过 `@deepseek-ai/dsh-client-remote-roots` 注册数据与操作。本包负责展示、根据侧边栏 Workspace 查询过滤顶层根、按需读取、Session 选择、历史渲染、prompt 提交、轮询、取消、结果未知时的幂等重试和随插件卸载。移除本包不会移除供应方；移除供应方会撤下其远程根，不改变本地 Workspace 状态。

## 模型体验

无，因为这个浏览器侧包只展示 Provider 会话与控件，不会组装或修改模型请求。

#### KV Cache 影响

无。

## 已知限制与后续工作

- Provider 会话目前使用有界轮询，而不是浏览器事件流。只有消息块带有可直接使用的 URL 或 base64 来源时，才能显示 Provider 附件。
