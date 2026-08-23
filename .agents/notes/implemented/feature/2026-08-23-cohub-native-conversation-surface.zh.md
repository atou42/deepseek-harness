# Agent Note：原生 Cohub 会话界面

状态：已实现

[English](2026-08-23-cohub-native-conversation-surface.md) | 中文

## 问题

原生 Cohub Session 最初通过弹窗抽屉打开。虽然执行与持久化已经属于 Cohub，但抽屉让它看起来仍像一个嵌入的次级工具，而且缺少 Agent Turn 开始前用户会期待的两个控件：模型与思考强度。

## 决策

现在打开 Cohub Space 或 Session 时，会通过根作用域 `conversation.remote` seat 接管 DSH 中栏会话界面。侧栏和 DSH 外壳保持不变；远端界面使用与本地 DSH 会话一致的完整页头、对话节奏、居中正文和底部输入框形态。关闭后会露出原样保留的本地 Session，不再出现遮罩或侧边抽屉。

回到本地由本地导航动作直接负责：全局“新会话”、本地 Session 行，以及本地 fork 完成后的打开动作，都会先退出远端会话，再打开本地状态。这里不能只监听 Session id，因为“新会话”可能复用已经为空的本地 Session，不会产生新的 Session id。

Cohub 消息块中的文本、思考、工具调用、工具结果、Shell 命令、系统提示和图片语义会完整经过 Host 与 Provider 无关的浏览器服务。Turn 运行期间，Cohub 适配器会在已保存 Turn 内容上叠加 Cohub 的流快照，让部分思考与工具活动随着会话轮询刷新。中栏使用与 DSH 一致的紧凑展开行、运行扫光、可展开详情、Markdown 节奏和末尾跟随行为展示这些内容；每一条事实仍以 Cohub 返回的数据为准。

可交互远端 Provider 可以发布经过校验、按 Provider 分组的模型目录，并接收每个 Turn 可选的模型与思考强度。Cohub Provider 从 Cohub 读取模型目录，使用 Cohub 支持的思考强度词表，并把用户选择随原生 prompt 一起提交。保持默认时不会伪造覆盖值，默认模型与 prompt 执行仍由 Cohub 决定。损坏的模型目录、不完整的 Provider/模型组合和未知思考强度都会明确失败。

## 考虑过的替代方案

**只美化抽屉。** 这样可以改善外观，但无法解决次级、非原生的交互形态。

**直接复用本地 DSH 模型选择器。** 该选择器绑定本地 Session 的路由与模型状态。把它挂到 Cohub Session 会暗示 DSH 持有执行权，也会把本地假设带入 Provider 持有的 Turn。

**写死模型列表。** Cohub 可用模型会随账号和部署变化，因此界面读取已登录平台的模型目录；读取失败时明确显示错误。

**根据状态或回答文本猜测进度。** 通用加载提示无法呈现真实思考和工具活动，因此界面直接投影 Cohub 的类型化内容和流快照；损坏或不支持的消息块会明确失败，不会虚构进度。

**只在本地 Session id 变化时退出 Cohub。** 复用空 Session 不会产生新身份，所以本地导航动作本身必须退出远端目标。

## 验证

- UI 测试证明 Cohub 界面占据原生中栏 `main`，不是 dialog，并能选择模型、思考强度和提交相应值。
- 导航测试证明“新会话”和本地 Session 选择会退出当前远端会话，即使本地 Session 身份没有变化。
- Host 与 UI 测试证明 Cohub 的实时思考与工具消息块能够经过校验，并以可展开的 DSH 原生进度行呈现。
- Provider 与 Host 测试证明模型目录校验和 prompt 精确转发。
- 组装后的 Web 测试使用真实发布版 DSH 组合，对接受控的 Cohub HTTP 边界，选择模型与思考强度，并核验云端 prompt 内容和 Cohub 保留结果。

## 结果

进入 Cohub 现在像是在 DSH 内切换会话归属，而不是启动一个套在里面的产品；任何普通本地导航都可以直接回到本地会话。Agent、prompt、Turn 生命周期、Session 持久化、思考文本和工具活动仍由 Cohub 持有。本地 DSH Session 只是在下层保持挂载，不会被同步或修改。

本 Note 细化了 [在 DSH 中原生使用 Cohub Agent Session](2026-08-23-cohub-native-agent-sessions.zh.md) 的界面决策；执行与持久化边界仍由原 Note 负责。
