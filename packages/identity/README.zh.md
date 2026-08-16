# identity/ — 共享身份

[English](README.md) | 中文

跨产品领域共享的身份能力。匿名关联与明确登录的账号分属不同包，采用不同的存储和暴露边界。

| 包 | 职责 | ctx key |
|---|---|---|
| [`anonymous-user-id/`](anonymous-user-id/README.md) | 为遥测、反馈和 DeepSeek 请求持久化一个限定于 Harness home 的匿名关联 id | — |
| [`cohub-account/`](cohub-account/README.md) | 负责一个 Host 侧 Cohub 登录、私有会话、刷新与登出生命周期 | `cohubAccount` |
