# @deepseek-ai/dsh-client-ui-remote-roots

[English](README.md) | 中文

面向 DSH 的匿名、与供应方无关的远程根列表。它把带来源标记的远程根放在本地 Workspace 旁边显示，支持文件夹、文件、链接和 Session 行，但所有身份仍保持不透明。它不会创建 Workspace、cwd、本地路径、Shell 目标、账号或凭据。

供应方通过 `@deepseek-ai/dsh-client-remote-roots` 注册数据与操作。本包只负责展示、按需读取、取消、重试和随插件卸载。移除本包不会移除供应方；移除供应方会撤下其远程根，不改变本地 Workspace 状态。

## 模型体验

无，因为本包只负责浏览器展示，不发送任何模型输入。

#### KV Cache 影响

无；它既不组装也不发送 Provider 请求。

## 已知限制与后续工作

- 该列表刻意仅支持浏览。打开 Session 历史和其他 Provider 专属操作不属于这个匿名展示包。
