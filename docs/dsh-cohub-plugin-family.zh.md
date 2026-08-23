# DSH × Cohub 插件家族

[English](dsh-cohub-plugin-family.md) | 中文

本文定义 Cohub 能力在 DSH 内的组合方式。它是一组可独立加载的插件，不是捆绑应用，也不会把 Cohub 运行时嵌进 DSH。

## 组合原则

身份和产品能力分层处理。调用 Cohub 鉴权接口的插件依赖 Host 侧 Cohub Account 服务。与 Provider 无关或只在浏览器本地运行的能力不需要 Cohub 身份。

浏览器账号界面是可选项。卸载它只会移除登录界面，不会移除 Host 账号服务。其他插件不能持有、保存、刷新、导出或注销 Cohub 凭证。Cordis 根据声明的服务关系决定激活时机，不依赖文件次序。

## 插件映射

| 关注点 | Host 插件 | 浏览器插件 | Cohub 身份 |
| --- | --- | --- | --- |
| 通用远程文件夹 | — | `@deepseek-ai/dsh-client-remote-roots` 和 `@deepseek-ai/dsh-client-ui-remote-roots` | 不需要 |
| Cohub 账号 | `@deepseek-ai/dsh-cohub-account` | `@deepseek-ai/dsh-client-cohub-account` | Host 持有身份，浏览器只接收不含令牌的状态 |
| Space 与 Session | `@deepseek-ai/dsh-cohub-spaces` | `@deepseek-ai/dsh-client-cohub-spaces` | 需要 |
| 生成式模型 | `@deepseek-ai/dsh-llm-cohub` | 使用 DSH 现有模型界面 | 需要 |
| 多媒体生成 | `@deepseek-ai/dsh-cohub-generation` | 使用 DSH 现有工具界面 | 需要 |
| Board | `@deepseek-ai/dsh-cohub-board` | `@deepseek-ai/dsh-client-cohub-board` | 需要 |

通用远程文件夹接口与 Cohub 无关。其他 Provider 可以注册带标识的根节点，不必引用 Cohub，也不必要求用户登录 Cohub。

## 独立组合

### 与 Provider 无关的云文件树

加载通用远程文件夹注册服务和界面。Provider 插件可以提供云端、网络或外部文件夹。这个组合不涉及 Cohub 账号。

### 只提供 Cohub 登录

在 Host 加载 Cohub Account，并按需加载浏览器账号界面。它提供设备登录和退出，但不会自行启用 Space、模型、生成或 Board。

### 在 DSH Session 中使用 Cohub Space

加载 Cohub Account、Cohub Spaces、通用远程根注册服务与界面，以及 Cohub Spaces 浏览器 Provider。每个可访问的 Space 都显示成带 `Cohub` 标识的根节点；展开后显示该 Space 的 Session，而不是文件。选择 Space 会创建普通 DSH Session，把 Space 绑定到该 Agent，并打开标准 DSH 工作台。Agent 会保留本地工具，同时获得限定到该 Space 的 Cohub 文件和命令工具。

Space 根节点不会伪装成 DSH 本地 Workspace。选择它时，会把远程根与配置好的普通本地 Workspace 配对，再启动一个 DSH Session：本地工具使用该 cwd，Cohub 工具使用不透明的 Space 身份。展开它只会列出 Cohub Session。提示词不会被路由到 Cohub Agent，已有 Cohub Session 也只会以只读历史打开。

### 模型、生成和 Board

模型组合是 Cohub Account、`@deepseek-ai/dsh-llm-cohub` 和显式指定的 Space。多媒体组合是 Cohub Account、`@deepseek-ai/dsh-cohub-generation` 和显式指定的 Space。两者都不要求加载 Space 文件、Board 或 Cohub 浏览器界面。

Board 组合加载 Cohub Account、Cohub Spaces、Cohub Board 和对应浏览器界面。它通过 Space 接口发现 `.board` 清单，并在文件树之外独立展示只读 Board。

## 失败与卸载

缺少身份时应明确显示匿名或未授权状态。损坏的身份、异常 Provider 数据、权限拒绝、网络故障和能力缺失都必须作为错误显露，不能伪装成空文件夹、匿名成功或默认模型结果。

每个插件只注销自己拥有的能力。生命周期隔离会阻止迟到的异步结果恢复已经卸载的状态。卸载能力插件不会退出账号。退出账号会让依赖 Cohub 的能力失效，但不会移除与 Provider 无关的浏览器能力。

## 明确不做

这组插件不会内嵌 Cohub CLI 或 SDK，不会替换 DSH Agent，不会替换其本地 Shell，不会静默同步 Space 文件，不会发布 Work，不会把 Space 变成本地 Workspace，也不会提供一体化便利捆绑包。Space 绑定只会增加有界的一次性 Cohub 命令工具。

组合关系保留在明确的 profile patch 或部署层。用户可以按需选择，整个接入不会变成只能整体启用的重型组合。
