# @deepseek-ai/dsh-client-ui-remote-roots

[English](README.md) | 中文

面向 DSH 的匿名、与供应方无关的远程根和会话界面。它把带来源标记的远程根放在本地 Workspace 旁边显示，并保持所有 Provider 身份不透明。远端根只提供 Provider 云端会话操作；Provider Session 行会让该会话接管 DSH 原生中栏，而不是打开抽屉。可交互来源会使用熟悉的页头、对话、输入框、模型与思考强度控件，并提供近实时轮询和取消控制。本包不会从远端根创建本地 DSH 会话，也不会创建账号、凭据或虚构本地路径。

供应方通过 `@deepseek-ai/dsh-client-remote-roots` 注册数据与操作。本包负责展示、按需读取、Session 选择、历史渲染、prompt 提交、轮询、取消、结果未知时的幂等重试和随插件卸载。移除本包不会移除供应方；移除供应方会撤下其远程根，不改变本地 Workspace 状态。

## 模型体验

输入框读取 Provider 校验后的模型目录，并可随下一条 Provider Turn 提交模型与思考强度覆盖值。任一控件保持 Cohub 默认时都不会伪造值；prompt 组装与执行仍由 Provider 负责。

#### KV Cache 影响

无。

## 已知限制与后续工作

- Provider 会话目前使用有界轮询，而不是实时事件流。详细 Provider 工具进度展示仍留待后续。
