# @deepseek-ai/dsh-cohub-spaces

[English](README.md) | 中文

Host 侧 Cohub Space 适配器。它只通过唯一的 `ctx.cohubAccount` 所有者取得访问令牌，校验平台返回的每一份数据，并提供类型化 Remote 方法，用于列出可访问 Space、完整读取一个 Space 内的分页 Session，以及执行更底层的相对目录树和文本文件操作。Space 始终是远程语义根；本包不会创建本地 Workspace、cwd、路径映射、Shell 目标、同步循环或 Work 发布。

实现直接调用 Cohub 平台 HTTP API，不依赖 Cohub CLI 或 SDK。Space、Session 与文件标识可以经过浏览器边界，账号凭证不会。Session 分页遇到重复游标、重复身份或跨 Space 数据时会明确失败，不会返回残缺列表。文件版本会原样保留平台返回的毫秒时间戳（包括小数毫秒）和字节大小。二进制文件与 URL 交付文件会明确失败。过期版本写入会返回当前远端文本与版本，不会覆盖它。

## 模型体验

无，因为这个 Host 数据适配器不注册提示词、工具或模型可见上下文。

#### KV Cache 影响

无。

## 已知限制与后续工作

- 本适配器只处理已有 Space 目录树和内联 UTF-8 文本。上传、删除、移动、远端 Shell、静默同步和 Work 发布都刻意不在契约内。
