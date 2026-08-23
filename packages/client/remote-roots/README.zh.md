# @deepseek-ai/dsh-client-remote-roots

[English](README.md) | 中文

面向浏览器的通用远程根能力接口。Provider 注册带明确标识的远程根列表，以及基于不透明 ID 的浏览、读取、写入、可选本地 DSH Session 启动和可选只读或可交互的 Provider 会话。两个启动入口彼此独立：`startWorkspace` 交给 Provider 准备本地 DSH，`openConversation` 只选择 Provider 持有的历史，不会启动本地 Agent；可交互来源还可以发布模型目录、接收可选的模型与思考强度选择、提交和取消 Provider Turn。契约不包含本地路径，不会把远程根接纳为本地 Workspace，也不会修改 Session cwd。注册服务会校验所有发布和返回，只在匹配的 Provider 提交成功后更新当前目标，并在 Provider 插件卸载时撤销状态和订阅。正常的未登录状态会显示为带 Provider 名称的待认证状态，不会当成错误；传输失败、身份不匹配、重复条目、无效元数据以及不支持的结果仍会明确失败。

## 模型体验

无，因为该注册服务只负责界面侧数据访问，不会注入模型可见上下文。

#### KV Cache 影响

无。

## 已知限制与后续工作

- 本包不包含显示界面。Board 文档和生成资产将使用独立的通用能力接口，不扩张文件式契约。
