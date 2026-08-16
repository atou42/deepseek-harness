# @deepseek-ai/dsh-cohub-generation

[English](README.md) | 中文

面向 Host 的 DSH 插件，用于接入 Cohub 已登录账号的多媒体生成接口。它使用唯一的 `@deepseek-ai/dsh-cohub-account` Token owner，注册三个模型工具，不依赖 Cohub Space/文件、Board 或浏览器界面包。

## 配置

```yaml
- id: cohub-generation
  name: '@deepseek-ai/dsh-cohub-generation'
  config:
    spaceId: 00000000-0000-0000-0000-000000000000
    apiBaseUrl: https://api.cohub.run
    pollIntervalMs: 1500
    timeoutMs: 1800000
```

`spaceId` 必须配置，因为 Cohub 会在 Space 内完成每项生成的授权、归属、归档和计费。它不会带来本地 Workspace、cwd、Shell、文件同步、Session 或 Work 发布能力。超时只停止本地等待，不会取消或重新创建服务端任务。

## 工具

`cohub_generation_models` 读取已登录账号的多媒体模型目录。普通发现会过滤标为隐藏的声明，显式参数可以把它们包含进来。动态参数和元数据声明会作为已校验的 JSON 字符串返回，既保留服务端字段，也不放宽 DSH 工具输出契约。

`cohub_generate` 只创建一项计费任务，然后轮询到完成、失败、取消或本地超时。它接收提示词、公开媒体引用、声明拥有的参数和声明拥有的元数据。Cohub 没有提供调用方幂等键，因此创建请求不会重试。

`cohub_generation_status` 读取已有任务，不会新建任务或重复计费。创建后若等待失败，错误会保留任务 ID，之后可以通过该工具恢复同一项任务。

完成后的图片 URL 会保留在标准结果中。挂载 DSH 附件存储后，插件还会下载并校验生成图片，执行存储所声明的字节和媒体类型限制，并在返回图片块前持久化。下载失败时会保留原始 URL，并返回明确的附件警告。内联 base64 图片必须使用附件存储。DSH `0.1.0-rc.5` 没有持久视频或音频附件接口，因此视频与音频结果保留为 Provider URL。

Cohub Bearer Token 只出现在 Host 请求头。模型目录、工具参数、任务 ID、输出、附件元数据、响应内容和插件日志都不含凭据。卸载会取消活跃请求，并等待该插件拥有的工作结束。

## 模型体验

### 生成模型目录

#### 模型看到的内容

模型会收到准确的 Cohub 模型 ID、标题、描述、接受的媒体类型，以及服务端拥有的 `parametersJson` 和可选 `metaJson` 声明。只有显式请求时才会出现隐藏模型。

#### Token 影响

目录大小就是直接的 Token 成本。工具不会添加适配器编写的示例或推断默认值。

#### KV Cache 影响

目录结果不变时，可以保留更早的提示前缀。目录变化只会改变返回的工具结果后缀。

### 生成请求

#### 模型看到的内容

执行生成的 Cohub 模型会收到调用方提示词、有序公开媒体引用、参数和模型自有元数据，不含额外提示词文本。Cohub 根据准确模型 ID 决定背后的 Provider。

#### Token 影响

生成模型使用自己的文本与媒体计量方式。DSH 不会重新解释 Cohub 的 Provider 价格或计费结果。

#### KV Cache 影响

多媒体生成任务不使用对话模型的前缀缓存。重复使用提示词不会让本插件复用或去重计费任务。

### 生成结果

#### 模型看到的内容

文本与媒体 URL 会进入结构化工具结果。持久化后的生成图片也会成为 DSH 图片块，因此支持图片的对话路由可以在下一次请求中查看它们。

#### Token 影响

结果元数据与 URL 消耗普通工具结果 Token。图片 Token 由下一次接收持久图片块的对话模型决定。

#### KV Cache 影响

持久工具结果和图片引用会进入后续 DSH 历史。等待中、失败、结构错误、取消或本地超时的轮询不会伪造完成结果。

## 已知限制与暂缓事项

- Cohub 原始补全适配器目前会拒绝 DSH 工具，因为原始补全契约没有工具 Schema 或工具历史支持。这些生成工具可以与另一条支持工具的 DSH 对话 Provider 一起使用，不会把执行交给 Cohub Session。
- 输入引用只接受公开 HTTP 或 HTTPS 媒体 URL。上传本地文件、交换私有 URL 和把 Space 文件转换为生成输入不在这个独立包内。
- DSH `0.1.0-rc.5` 有持久图片附件接口，但没有同类视频或音频接口。内联 base64 视频或音频会明确失败，并保留可恢复的任务 ID。
- 本地超时或取消只停止轮询，不会停止服务端生成。应使用保留的任务 ID 调用 `cohub_generation_status`，不要重复创建计费任务。
- 该包不会把输出放入 Board、修改 Space 文件、创建 Session、发布 Work 或暴露 Cohub 远端执行。
