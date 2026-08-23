# Agent Note：Cohub Space Session 导航

状态：已实现

[English](2026-08-16-cohub-space-session-navigation.md) | 中文

## 问题

最初的 Cohub 预览把 Space 显示成云文件夹，展开后展示其中的文件。这个模型不适合工作区导航：用户选择的是作为会话容器的 Cohub Space，它在这里的直接子项应该是 Cohub Session。

## 决策

本地 DSH Workspace 与 Cohub Space 仍保持不同语义，但共同出现在 Workspace 导航和选择界面。Cohub Provider 把每个可访问 Space 发布成带标识的远程根。展开 Space 时，通过已登录的 Host 适配器完整读取分页 Session，并把每项显示成带会话图标、身份不透明的 Session 行。这个路径不会调用文件树接口。

主 Workspace 选择器会把远程根和本地 Workspace 一起列出。选择 Cohub Space 时，通过 [Cohub Space DSH Session 绑定](../bug-fix/2026-08-17-cohub-space-dsh-session-binding.zh.md)启动普通 DSH 工作台。选择已有 Cohub Session 时，只在只读查看器中打开它的 Turn 历史；这条导航路径不会向 Cohub Agent 发送提示词。

Host 会校验每一页 Session，持续跟随游标直到完整，并拒绝重复游标、重复 Session 身份、跨 Space 数据、错误时间戳和损坏的分页元数据。失败会原样显示，不会伪装成残缺列表或空列表。

这次改动不会把 Cohub Session 导入 DSH 持久化，不会改变 cwd，也不会宣称 Cohub Session 就是本地 DSH Session。供应方 Session 和 Turn 历史始终以 Cohub 为准。

## 考虑过的替代方案

**在 Workspace 树里显示 Space 文件。** 这会掩盖用户期待的 Cohub Session 模型，也会重复已经属于绑定 DSH Agent 工具的文件访问能力。

**选择 Space 时打开 Cohub Agent。** 这会绕开 DSH harness，现已由上文链接的 DSH Session 绑定替代。

## 验证

- Host 与客户端聚焦测试覆盖完整 Session/Turn 分页、不透明身份路由、取消、鉴权、卸载、空标题，以及不出现文件条目。
- 选择器和会话界面测试证明：供应方 Session 行只会打开只读历史，不会渲染供应方提示词输入框。
- 真实客户端组合测试共同挂载 Workspace 浏览器、通用远程根注册与界面、Cohub Provider，展开 Space 后观察到 Session 行，同时本地 Workspace 状态保持为空。
- 在隔离预览上完成已登录浏览器实测：展开 `deepseek harness` 后，显示 Cohub CLI/API 返回的全部 6 个 Session，没有显示 Space 文件。

## 影响

导航树现在明确区分“开始新的 DSH 工作”和“读取已有 Cohub 历史”。Cohub Session 历史在这里保持只读，文件操作则交给绑定后的 DSH Agent 工具。
