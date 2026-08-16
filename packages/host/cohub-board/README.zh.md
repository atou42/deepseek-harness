# Cohub Board

[English](README.md) | 中文

只读的 Cohub Board Host 适配器。身份认证由 Cohub Account 独占管理。本包不提供创建、编辑、事务、播放、发布、会话、Shell 或 Workspace 能力。

## 模型体验

无，因为这个 Host 侧 Board 适配器不注册提示词、工具、消息或 Provider 请求。

#### KV Cache 影响

无。

## 已知限制与后续工作

Board 清单由独立的 Cohub Space Provider 发现。暂不提供 Board 编辑和私有二进制资源代理。
