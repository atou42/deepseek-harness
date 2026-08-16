# @deepseek-ai/dsh-client-ui-remote-roots

[English](README.md) | 中文

面向 DSH 的匿名、与供应方无关的远程根和会话界面。它把带来源标记的远程根放在本地 Workspace 旁边显示，可以打开供应方持有的 Session，并提供远程会话工作台，但所有身份仍保持不透明。它不会创建本地 Workspace、cwd、本地路径、Shell 目标、账号或凭据。

供应方通过 `@deepseek-ai/dsh-client-remote-roots` 注册数据与操作。本包负责展示、按需读取、Session 选择、历史渲染、消息提交、执行中 Turn 刷新、取消、重试和随插件卸载。移除本包不会移除供应方；移除供应方会撤下其远程根，不改变本地 Workspace 状态。

## 模型体验

远程工作台里输入的消息会发送到选中的供应方 Session。模型、上下文、工具和持久化仍由供应方负责。

#### KV Cache 影响

取决于供应方。本包自身不组装模型上下文。

## 已知限制与后续工作

- 消息被接受后，Turn 更新目前通过短轮询刷新。供应方事件流和详细工具进度展示仍留待后续。
