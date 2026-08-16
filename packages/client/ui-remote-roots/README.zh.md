# @deepseek-ai/dsh-client-ui-remote-roots

[English](README.md) | 中文

面向 DSH 的匿名、与供应方无关的远程根和历史界面。它把带来源标记的远程根放在本地 Workspace 旁边显示，并在只读历史查看器中打开供应方持有的 Session，同时保持身份不透明。选择根节点后仍使用普通 DSH 工作台。本包不会创建本地 Workspace、cwd、本地路径、账号或凭据。

供应方通过 `@deepseek-ai/dsh-client-remote-roots` 注册数据与操作。本包负责展示、按需读取、Session 选择、历史渲染、取消、重试和随插件卸载。它不提供向供应方发送消息的输入框。移除本包不会移除供应方；移除供应方会撤下其远程根，不改变本地 Workspace 状态。

## 模型体验

无直接影响，因为历史查看器不会发送提示词，新消息由普通 DSH 工作台处理。

#### KV Cache 影响

无。

## 已知限制与后续工作

- 供应方 Session 历史是一次性读取。供应方实时事件流和详细工具进度展示仍留待后续。
