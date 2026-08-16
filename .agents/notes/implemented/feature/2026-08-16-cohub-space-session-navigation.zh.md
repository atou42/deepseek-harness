# Agent Note：Cohub Space Session 导航

状态：已实现

[English](2026-08-16-cohub-space-session-navigation.md) | 中文

## 问题

最初的 Cohub 预览把 Space 显示成云文件夹，展开后展示其中的文件。这个模型不适合工作区导航：用户选择的是作为会话容器的 Cohub Space，它在这里的直接子项应该是 Cohub Session。

## 决策

本地 DSH Workspace 与 Cohub Space 仍保持不同语义，但共同出现在 Workspace 导航和选择界面。Cohub Provider 把每个可访问 Space 发布成带标识的远程根。展开 Space 时，通过已登录的 Host 适配器完整读取分页 Session，并把每项显示成带会话图标、身份不透明的 Session 行。这个路径不会调用文件树接口。

主 Workspace 选择器会把可对话的远程根和本地 Workspace 一起列出。选择 Cohub Space 时，打开与供应方无关的远程会话工作台，不创建本地 Workspace。选择已有 Cohub Session 时，打开它的 Turn 历史。发送第一条消息会创建 Cohub Session，后续消息继续当前 Session。Turn 仍在执行时，工作台会刷新云端历史，直到 Turn 进入结束状态。

Host 会校验每一页 Session，持续跟随游标直到完整，并拒绝重复游标、重复 Session 身份、跨 Space 数据、错误时间戳和损坏的分页元数据。失败会原样显示，不会伪装成残缺列表或空列表。

这次改动不会把 Cohub Session 导入 DSH 持久化，不会改变 cwd，也不会宣称 Cohub Session 就是本地 DSH Session。Session 和 Turn 状态始终以 Cohub 为准。

## 验证

- Host 与客户端聚焦测试覆盖完整 Session/Turn 分页、不透明身份路由、首条消息创建 Session、后续消息路由、取消、鉴权、卸载，以及不出现文件条目。
- 选择器和会话界面测试证明：选择 Cohub Space 不会创建本地 Workspace，消息被接受后会重新读取云端历史。
- 真实客户端组合测试共同挂载 Workspace 浏览器、通用远程根注册与界面、Cohub Provider，展开 Space 后观察到 Session 行，同时本地 Workspace 状态保持为空。
- 在隔离预览上完成已登录浏览器实测：展开 `deepseek harness` 后，显示 Cohub CLI/API 返回的全部 6 个 Session，没有显示 Space 文件。
