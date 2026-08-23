# Agent Note：原生 Cohub 会话界面

状态：已实现

[English](2026-08-23-cohub-native-conversation-surface.md) | 中文

## 问题

原生 Cohub Session 最初通过弹窗抽屉打开。虽然执行与持久化已经属于 Cohub，但抽屉让它看起来仍像一个嵌入的次级工具，而且缺少 Agent Turn 开始前用户会期待的两个控件：模型与思考强度。

## 决策

现在打开 Cohub Space 或 Session 时，会通过根作用域 `conversation.remote` seat 接管 DSH 中栏会话界面。侧栏和 DSH 外壳保持不变；远端界面使用与本地 DSH 会话一致的完整页头、对话节奏、居中正文和底部输入框形态。关闭后会露出原样保留的本地 Session，不再出现遮罩或侧边抽屉。

可交互远端 Provider 可以发布经过校验、按 Provider 分组的模型目录，并接收每个 Turn 可选的模型与思考强度。Cohub Provider 从 Cohub 读取模型目录，使用 Cohub 支持的思考强度词表，并把用户选择随原生 prompt 一起提交。保持默认时不会伪造覆盖值，默认模型与 prompt 执行仍由 Cohub 决定。损坏的模型目录、不完整的 Provider/模型组合和未知思考强度都会明确失败。

## 考虑过的替代方案

**只美化抽屉。** 这样可以改善外观，但无法解决次级、非原生的交互形态。

**直接复用本地 DSH 模型选择器。** 该选择器绑定本地 Session 的路由与模型状态。把它挂到 Cohub Session 会暗示 DSH 持有执行权，也会把本地假设带入 Provider 持有的 Turn。

**写死模型列表。** Cohub 可用模型会随账号和部署变化，因此界面读取已登录平台的模型目录；读取失败时明确显示错误。

## 验证

- UI 测试证明 Cohub 界面占据原生中栏 `main`，不是 dialog，并能选择模型、思考强度和提交相应值。
- Provider 与 Host 测试证明模型目录校验和 prompt 精确转发。
- 组装后的 Web 测试使用真实发布版 DSH 组合，对接受控的 Cohub HTTP 边界，选择模型与思考强度，并核验云端 prompt 内容和 Cohub 保留结果。

## 结果

进入 Cohub 现在像是在 DSH 内切换会话归属，而不是启动一个套在里面的产品。Agent、prompt、Turn 生命周期和 Session 持久化仍由 Cohub 持有。本地 DSH Session 只是在下层保持挂载，不会被同步或修改。

本 Note 细化了 [在 DSH 中原生使用 Cohub Agent Session](2026-08-23-cohub-native-agent-sessions.zh.md) 的界面决策；执行与持久化边界仍由原 Note 负责。
