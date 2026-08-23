# Agent Note: 远程会话插入 Provider 原生 Space 引用

Status: implemented

[English](2026-08-24-native-remote-space-mentions.md) | 中文

## Problem

远程会话界面已经提供 Provider 持有的 Agent、Session 历史、模型与思考强度，但输入框仍把 `@` 当作普通文字。对 Cohub 而言，这会丢失把另一个 Space 加入当前云端会话的原生入口。直接复用普通本地 DSH 引用也不正确：本地 Session 会把 Space 序列化为 `cohub_space_*` 工具指引，而 Cohub Agent 需要 Cohub 自己的 `cohub://spaces/…` 引用。

## Decision

`RemoteRootView` 可以发布可选且非空的 `conversationReference`。通用注册服务只校验并保留该字符串，不解释其语法。Cohub 来源发布 Cohub 自身使用的标准 `@[名称](cohub://spaces/id)` 形式。

远程会话输入框只在空白边界识别 `@`，搜索当前 Provider 来源中的其他远程根，排除当前根，并支持鼠标和键盘选择；选中后，触发文字会被替换为该远程根由 Provider 提供的引用。通用界面不会自行构造 Cohub URI。普通本地 DSH 输入框继续使用原有的 `cohub-space:` 引用与工具上下文路径。

## Alternatives considered

- **复用本地 DSH Space 引用。** 不采用，因为它通过 DSH 工具让本地 Agent 访问资产，并不是给云端 Agent 添加 Cohub 原生的跨 Space 上下文。
- **在通用界面中构造 `cohub://` 链接。** 不采用，因为 URI 应由 Provider 持有；写死 Cohub 语法会破坏远程根包与供应方无关的边界。
- **在列表中显示当前 Space。** 不采用，因为当前 Cohub Agent 已经把这个 Space 作为工作区上下文，再次选择只会增加噪声，不会增加新上下文。

## Consequences

Cohub 云端会话现在拥有原生的跨 Space 引用流程，同时不会改变本地 DSH Session 的行为。没有发布 `conversationReference` 的 Provider 不会出现在列表中。当前实现搜索活动来源已经发布的远程根；Cohub 会在激活会话前发布用户可访问的 Space 列表，因此输入框不会增加第二条搜索传输或凭证路径。

聚焦的契约与界面测试固定了引用发布和校验、排除当前根、筛选、键盘插入，以及提交给 Provider 的准确文本。
