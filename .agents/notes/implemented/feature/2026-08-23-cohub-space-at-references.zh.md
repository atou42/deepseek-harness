# Agent Note：Cohub 云端选择与本地 @Space 引用

状态：已实现

[English](2026-08-23-cohub-space-at-references.md) | 中文

## 问题

把每个 Cohub Space 同时显示成 **Cohub Agent · 云端**和 **DSH Agent · 本地**，会迫使用户在开始工作前先理解执行架构。本地条目看起来像另一种 Cohub 工作区，实际上却会创建一段历史只保存在本机的 DSH Session。

## 决策

工作区选择器和远端树只显示一次 Cohub Space。选中后始终打开由 Cohub 持有的云端会话。Agent、prompt 执行、Turn、Session 历史、取消和持久化都归 Cohub。

本地 DSH 工作从普通本地 Workspace 开始。Session 需要 Cohub 资产时，输入框的 `@` 菜单会搜索已登录账号可访问的 Space，并插入一个不可拆分的 `@Cohub Space` 引用。提交时，该引用会序列化为明确的标题和不透明 `space_id`。Host 会给本地 DSH Agent 安装四个云端工具；每次调用都必须带这个准确 id。Space 路径始终是远端相对路径，不会伪装成本地路径。

旧版已经绑定到某个 Space 的 Session 仍可读取，并可省略 `space_id`；新界面不再创建这种绑定。引用损坏、id 缺失、Space 不可访问、传输失败或 Provider 响应损坏都会明确失败，不允许在本地和云端之间自动降级。

## 备选方案

**保留两个条目，只改进名称。** 不采用，因为主选择器仍会暴露实现选择，并让每个 Space 重复出现。

**选择本地条目时继续绑定整个 Space。** 不采用，因为它会把远端根伪装成本地 Workspace，而且用户可能只想在一项任务里使用一份云端资产。

**允许本地 Agent 在没有明确引用时访问任意 Space。** 不采用，因为 prompt 看不出当前云端目标，遇到同名 Space 时也很容易用错。

## 验证

- 选择器和远端树测试证明每个 Space 只有一个云端入口，并且不存在本地 DSH 模式。
- Cohub 客户端测试覆盖 Space 搜索、查询过滤、原子引用插入、稳定剪贴板格式、严格引用校验和模型序列化。
- Host 测试证明未绑定的本地 Agent 会获得四个工具、缺少 `space_id` 会失败、明确 id 会路由到指定 Space，并保留旧版绑定会话兼容性。
- 组装后的浏览器快照固定了单条 Cohub 选择器。

## 结果

主选择器现在只回答一个问题：进入本地 Workspace，还是进入 Cohub 云端 Session。跨环境资产访问变成本地 DSH prompt 内的显式引用，不再伪装成第二种工作区模式。本地 Session 日志仍留在本地，原生 Cohub Session 日志仍留在 Cohub。

本 Note 只取代 [在 DSH 中原生使用 Cohub Agent Session](2026-08-23-cohub-native-agent-sessions.zh.md) 中的双模式呈现和新绑定入口。原 Note 仍负责原生云端执行、轮询、取消和 Cohub 持久化。
