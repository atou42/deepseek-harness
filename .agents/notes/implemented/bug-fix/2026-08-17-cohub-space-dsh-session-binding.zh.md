# Agent Note: Cohub Space DSH Session 绑定

Status: implemented

[English](2026-08-17-cohub-space-dsh-session-binding.md) | 中文

## 问题

选择 Cohub Space 后进入了 Cohub Agent 的会话路径。这绕过了 DSH Agent、文本记录、本地工具和这次集成本应提供的 harness 行为。实现还错误地假设每个 Cohub Session 都有非空标题，导致一个无标题 Session 让整个 Space 列表读取失败。

## 决策

选择 Cohub Space 时，会先解析配置的本地 cwd，把该路径幂等注册成普通本地 Workspace，再在其中创建 Host DSH Session。浏览器会先绑定所选 Space，再打开该 Session，因此绑定失败会明确显示，不会发布一个看似可用的选中状态。Cohub Space 的身份与路径仍是远程的；本地 Workspace 只是 DSH 本地工具的独立锚点。

Host 绑定会验证 Space 可访问、目标 DSH Agent 仍存活且尚无用户轮次。它会注入一条可持久化的说明消息，并在该 Agent 的作用域内注册四个工具，分别用于列出 Space 相对目录、读取 UTF-8 文件、按版本校验写入，以及执行有界的一次性命令。已有本地 DSH 工具继续保留，因此同一段 DSH 对话可以同时操作本地和 Cohub 资源。说明消息进入持久日志后，恢复的 Agent 会据此重建绑定。

Cohub Session 叶节点仍是供应方持有的历史。打开后只显示只读 Turn 查看器，不提供提示词输入框，也不会进入 Cohub Agent 路径。Session 标题必须是字符串，但可以为空；需要显示名称时，浏览器会使用最新消息文本，或使用基于短 id 的稳定标签。

## 考虑过的替代方案

**直接把提示词发送给 Cohub Agent。** 这会在工作区选择流程里再造一套 harness，并把 DSH Agent 排除在任务之外，违背集成目的。

**把 Space 本身转成本地 Workspace。** Space 没有本地规范路径或 cwd 语义。现在采用的是独立且明确的本地 cwd 锚点，不会重新解释 Space 路径，也不会静默同步。

**全局注册 Cohub 工具。** 全局工具会把一个账号的 Space 暴露给无关 DSH Session。限定到 Agent 的注册会把能力和模型上下文留在所选 Session 上。

## 验证

- Host 测试复现空 Session 标题，证明绑定保留既有 DSH Agent、安装四个限定作用域的工具和持久上下文、执行云端命令，并且从不调用 Cohub 提示词接口。
- 客户端注册表和 Provider 测试证明，根节点激活会等待 DSH Session 创建与 Host 绑定后再打开，而 Cohub Session 历史保持只读。
- Workspace 和浮层测试证明，选择 Space 后仍使用普通 DSH 工作台，只有根节点被选中时不会渲染供应方会话浮层。
- 浏览器实测证明，选择 Space 会在本地 Workspace 中打开普通 DSH 输入框，暴露持久化的 `cohub-space` 上下文，并能列出 Cohub Session，不会再被空标题条目拖垮整个 Space。

## 影响

DSH 持有新对话历史、模型选择、本地工具和 harness 行为。Cohub 持有 Space 文件、命令任务和旧 Cohub Session 历史。注入说明进入 DSH 日志后可以恢复绑定；如果进程在绑定完成后、第一条 DSH 提示词之前退出，仍为空白的 Session 可能没有可恢复的绑定标记。
