# Cohub Account UI

[English](README.md) | 中文

可独立加载的 DSH Cohub 设备登录与退出界面。浏览器只会收到公开账号状态、验证码和验证链接。访问令牌、刷新令牌、私有设备码、持久化和续期均由 Host 侧 Cohub Account 包独占管理。

## 模型体验

无，因为这个浏览器侧账号界面不注册提示词、工具、消息或 Provider 请求。

#### KV Cache 影响

无。

## 已知限制与后续工作

- 本界面不列出 Space、模型、生成能力、Board、Work、Shell 或本地 Workspace。
