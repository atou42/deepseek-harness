# Agent Note：Cohub Space Session 导航

状态：已实现

[English](2026-08-16-cohub-space-session-navigation.md) | 中文

## 问题

最初的 Cohub 预览把 Space 显示成云文件夹，展开后展示其中的文件。这个模型不适合工作区导航：用户选择的是作为会话容器的 Cohub Space，它在这里的直接子项应该是 Cohub Session。

## 决策

本地 DSH Workspace 与 Cohub Space 仍保持不同语义，但共同出现在 Workspace 导航区域。Cohub Provider 把每个可访问 Space 发布成带标识的远程根。展开 Space 时，通过已登录的 Host 适配器完整读取分页 Session，并把每项显示成带会话图标、身份不透明的 Session 行。这个路径不会调用文件树接口。

Host 会校验每一页 Session，持续跟随游标直到完整，并拒绝重复游标、重复 Session 身份、跨 Space 数据、错误时间戳和损坏的分页元数据。失败会原样显示，不会伪装成残缺列表或空列表。

这次改动不会把 Cohub Session 导入 DSH 持久化，不会改变 cwd，也不会宣称 Cohub Session 就是本地 DSH Session。打开 Turn 历史和发送后续消息属于下一层会话适配。

## 验证

- Host 与客户端聚焦测试覆盖完整分页、Session 身份路由、取消、鉴权、卸载，以及不出现文件条目。
- 真实客户端组合测试共同挂载 Workspace 浏览器、通用远程根注册与界面、Cohub Provider，展开 Space 后观察到 Session 行，同时本地 Workspace 状态保持为空。
- 在隔离预览上完成已登录浏览器实测：展开 `deepseek harness` 后，显示 Cohub CLI/API 返回的全部 6 个 Session，没有显示 Space 文件。
