# @deepseek-ai/dsh-client-ui-remote-roots

[English](README.md) | 中文

面向 DSH 的匿名、与供应方无关的远程文件夹树。它把带来源标记的远程根放在本地 Workspace 旁边显示，但所有根与子项仍使用不透明身份。它不会创建 Workspace、cwd、本地路径、Shell 目标、账号或凭据。

供应方通过 `@deepseek-ai/dsh-client-remote-roots` 注册数据与操作。本包只负责展示、按需读取、取消、重试和随插件卸载。移除本包不会移除供应方；移除供应方会撤下其远程根，不改变本地 Workspace 状态。

## 模型体验

无。本包只负责浏览器展示，不发送任何模型输入。

#### KV Cache 影响

无；它既不组装也不发送 Provider 请求。
