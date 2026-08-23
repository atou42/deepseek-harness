# @deepseek-ai/dsh-client-ui-remote-roots

[English](README.md) | 中文

面向 DSH 的匿名、与供应方无关的远程根和会话界面。它把带来源标记的远程根放在本地 Workspace 旁边显示，并保持所有 Provider 身份不透明。远端根只提供 Provider 云端会话操作；Provider Session 行打开由 Provider 持有的会话，可交互来源会显示独立输入框、近实时轮询和取消控制。本包不会从远端根创建本地 DSH 会话，也不会创建账号、凭据或虚构本地路径。

供应方通过 `@deepseek-ai/dsh-client-remote-roots` 注册数据与操作。本包负责展示、按需读取、Session 选择、历史渲染、prompt 提交、轮询、取消、结果未知时的幂等重试和随插件卸载。移除本包不会移除供应方；移除供应方会撤下其远程根，不改变本地 Workspace 状态。

## 模型体验

无，因为这个浏览器界面只把用户文本交给所选的会话执行方，不会组装或修改模型 prompt。

#### KV Cache 影响

无。

## 已知限制与后续工作

- Provider 会话目前使用有界轮询，而不是实时事件流。详细 Provider 工具进度展示仍留待后续。
