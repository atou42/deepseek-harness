# Agent Note: Cohub null Session 标题

Status: implemented

[English](2026-08-23-cohub-null-session-title.md) | 中文

## 问题

Cohub 可能为无标题 Session 返回 `title: null`。Space 适配器此前要求每个 Session 标题都必须是字符串，因此一条合法的无标题数据就会让 `listSessions` 拒绝整个 Space，导致所有 Session 都无法打开。

## 决策

将缺失或为 null 的 Session 标题投影为既有的空字符串无标题表示。其他非字符串标题类型、重复身份、损坏时间戳和跨 Space 数据仍然明确失败。

## 测试

回归测试使用本次报错中的 Session 标识和 `title: null`，先证明旧解析器会失败，再验证修复后的列表保留该 Session，并将标题表示为空字符串。Cohub Space 与远程工作区相关包的完整测试也全部通过。

## 备选方案

**丢弃损坏的数据行。** 已否决：静默返回不完整的 Session 列表会掩盖平台数据，并让一个有效会话凭空消失。

**把任意标题值转成字符串。** 已否决：对象和数字仍然属于损坏的协议数据，必须明确失败。

## 影响

无标题 Cohub Session 不再阻塞整个 Space 列表。面向用户的占位标题仍由浏览器负责，而真正损坏的标题值仍会作为错误暴露。
