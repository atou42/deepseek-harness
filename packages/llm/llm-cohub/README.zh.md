# @deepseek-ai/dsh-llm-cohub

[English](README.md) | 中文

这是接入 Cohub 登录态原始补全接口的 DSH Host 侧模型适配器。包只通过 `@deepseek-ai/dsh-cohub-account` 获取短期访问令牌，读取当前账号可用的 Cohub 模型目录，并公开一个名为 `cohub` 的 DSH Provider。它不依赖 Cohub Space/files 或浏览器 UI 包。

每个对外公布的 DSH 模型 id 都是一个不透明 JSON 二元组，内部保存 Cohub 的真实 Provider 与模型 id。选择器展示模型目录里的名称，请求时再恢复精确二元组并调用 `POST /api/spaces/:spaceId/completions`。这样不会把不同 Cohub Provider 下的同名模型混在一起。

## 配置

```yaml
- id: llm-cohub
  name: '@deepseek-ai/dsh-llm-cohub'
  config:
    spaceId: 00000000-0000-0000-0000-000000000000
    apiBaseUrl: https://api.cohub.run
    streamIdleTimeoutMs: 300000
```

`spaceId` 必填，因为 Cohub 会在 Space 范围内完成授权、归因、归档与计费。这里的 Space 只承担请求路由，不会让本包浏览或修改 Space 文件。`apiBaseUrl` 默认与账号包使用同一 Cohub API 地址。五分钟空闲上限覆盖首次请求和每次等待流式响应的时间。

适配器会在每次模型目录查询或精确模型查询时读取 `GET /api/models`。账号变化和服务端模型目录变化不需要重启进程。隐藏模型不会公布。上下文容量、输出上限、推理能力和输入类型会在公布前完整校验。只有挂载 DSH 持久附件服务时才公布图片输入能力。图片引用会在当前请求中读取、校验并转换为 base64。

Cohub 接口会创建计费补全，但没有调用方幂等键。因此本适配器登记为不自动重试。HTTP、登录、计费、响应损坏、流截断、超时和取消都会明确失败。卸载插件会终止进行中的请求，并由 Cordis 生命周期移除 Provider。

每个请求都会携带 DSH 标准应用归因头。Cohub 令牌只存在于 Host 请求头，不会进入模型 id、消息、目录、响应分片、浏览器构建产物或本包产生的日志。

## 模型体验

### Cohub 请求

#### 模型看到的内容

所选 Cohub 模型会收到 DSH 系统提示词、有序文本与推理历史、可选用户图片和已支持的调用参数，不含适配器撰写的提示词。真实 Cohub `provider` 和 `model` 来自已公布的不透明模型 id。

#### Token 影响

精确输入由底层 Provider 的分词方式决定。图片编码只改变传输体积，不改变模型看到的图片。Cohub 可用时会报告互不重叠的输入、输出、缓存读取和缓存写入数量。

#### KV Cache 影响

系统提示词与历史前缀不变时，可以继续使用所选 Cohub Provider 的缓存。切换真实 Provider 或模型会进入另一缓存域。修改更早的提示词或消息，可能从第一个变化 token 起失去复用。

### Cohub 响应

#### 模型看到的内容

Cohub 的推理与可见文本事件会转换为 DSH 推理和文本分片。只有最终消息与流式增量一致时，适配器才发布成功结束。

#### Token 影响

生成 token 遵循已解析的推理强度和输出上限。只有 DSH loop 保留的内容块会进入后续请求。

#### KV Cache 影响

保留的响应内容会追加到下一次请求，同时保留更早的前缀。损坏、失败、取消或截断的响应不会成为成功历史。

## 已知限制与暂缓事项

- Cohub 当前原始补全接口不接收工具 schema，运行时也不保留工具调用历史。DSH 请求包含工具、工具调用或工具结果时，适配器会在网络请求前失败。改用 Cohub Session 会把执行交给 Cohub 自己的 Agent 运行时，因此不在本适配器范围内。
- Cohub 原始补全接口不提供停止序列。DSH 请求带有非空停止列表时会在网络请求前失败。
- 当前 Cohub 补全运行时只保留用户输入中的图片，因此拒绝 assistant 图片。
- Space 必须显式配置，不从浏览器当前选中的云文件夹推断。这样模型包可以独立于 Space/files 和 UI 插件加载。
