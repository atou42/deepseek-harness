# Agent Note：在 DSH 中原生使用 Cohub Agent Session

状态：已实现

[English](2026-08-23-cohub-native-agent-sessions.md) | 中文

本 Note 中云端／本地双条目的呈现方式已由 [Cohub 云端选择与本地 @Space 引用](2026-08-23-cohub-space-at-references.zh.md) 取代。原生 Cohub Session 的归属不变。

## 问题

DSH 已经支持把 Cohub Space 绑定给本地 Agent，作为远端上下文使用。这个形态有价值，但它并不等于在 Space 内运行 Cohub Agent：Agent、prompt、Turn 生命周期和 Session 持久化仍在本地。过去一个没有明确模式的 Space 入口承载了两种含义，用户无法判断执行发生在哪里，也无法在 Cohub 中继续同一个云端 Session。

## 决策

每个具备相应能力的 Cohub Space 明确提供两种模式：

- **Cohub Agent · 云端**：打开或创建由 Cohub 持有的 Session。DSH 只作为客户端界面。prompt 执行、Turn 状态、历史、取消和持久化都由 Cohub 负责。
- **DSH Agent · 本地**：启动普通的本地 DSH Session，并把所选 Space 绑定为远端上下文。DSH Agent 和本地 Session log 仍是权威来源。

工作区选择器同时搜索本地 Workspace 和 Cohub Space，并为同一个 Space 分别列出两种模式。远端树也提供相同的两个操作。选择已有 Session 或云端模式时，会打开 Cohub 专属会话面板，明确标注云端归属，并使用自己的输入框；消息不会经过本地 DSH 输入框或 Agent loop。

Host 适配器通过 Cohub 的 Space prompt API 提交文本，以调用方的 `clientMessageId` 作为幂等标识，映射 Cohub 接受的 Session 与 Turn，在工作未结束时轮询保留的 Turn 历史，并在确认 Turn 属于所选 Space 和 Session 后调用 Cohub 取消。Space、Session 和 Turn 标识经过通用远端根边界时始终保持不透明。浏览器不会拿到 bearer token。

prompt 响应中断代表结果未知，不代表 prompt 一定失败。输入框会保留草稿，提示先刷新 Session 核验；只要内容不变，重试会复用同一个 `clientMessageId`。修改草稿后才会生成新的标识。Provider 校验、认证、传输、响应结构和取消错误都会明确显示，不会伪装成空 Session，也不会偷偷回退到本地执行。

## 考虑过的替代方案

**只保留本地 DSH 绑定。** 这样只有一条 harness 路径，但无法产生原生 Cohub Session，无法使用 Cohub Agent 的 prompt，也无法在 Cohub 内继续会话。

**根据用户点击入口静默选择模式。** 同一个 Space 会在没有明确选择的情况下改变执行与持久化归属。

**本地执行完成后再把 DSH 事件同步到 Cohub。** 复制文本不等于 Cohub Agent 运行；工具执行、Turn 状态、取消和云端续聊都会不一致。因此原生模式从第一条 prompt 开始就直接提交给 Cohub。

**把 Cohub Session 导入本地 DSH 持久化。** 双写会带来冲突和重试歧义。云端模式始终以 Cohub 为准，DSH 只渲染 Provider 投影。

## 验证

- Host 测试覆盖原生 prompt 创建与续聊、即时响应校验、不透明 Session/Turn 归属和取消前校验。
- Provider 与通用远端根测试覆盖交互能力、本地与云端的独立启动、消息与取消路由、标识校验、卸载和当前目标更新。
- UI 测试覆盖可搜索的双模式选择器、树上的明确操作、新建与已有云端 Session、Cohub 输入框、轮询、取消，以及结果未知时的幂等重试。
- 组装后的浏览器快照会启动真实发布版 Web 组合和 Cohub preview overlay。唯一伪造的边界是代替 Cohub 的本地 HTTP 服务。它固定了本地/云端选项、只在 Host 使用的登录凭证、原生 prompt 提交、Cohub 持久结果和 Provider 持有的会话面板。
- 没有执行真实登录 smoke：本机 Cohub CLI 当前返回 `Not authenticated`。因此测试不宣称创建了真实 Cohub Session。发布该构建前，仍必须完成线上验证。

## 结果

DSH 现在既可以作为使用 Cohub 上下文的本地 harness，也可以作为原生 Cohub Agent Session 的客户端，而且用户会在第一条 prompt 前看到执行归属。原生云端会话由 Cohub 持有，因此可以在 Cohub 和其他机器上继续。仅仅绑定 Space 不会上传本地 DSH Session。

本 Note 部分取代 [Cohub Space Session 导航](2026-08-16-cohub-space-session-navigation.zh.md) 中“只读交互”的选择。原 Note 继续负责“Space 是 Session 容器”的导航与不透明标识模型；本 Note 负责可交互的 Cohub 执行和明确的双模式选择。
