# Agent Note: Cohub OAuth 空白 token scope

Status: implemented

[English](2026-08-23-cohub-blank-token-scope.md) | 中文

## 问题

Cohub 的 OAuth 设备令牌成功响应在授权范围未变化时可能包含 `scope: ""`。账号解析器把每个已出现的字符串都当成必需的非空值，因此一次有效授权会在授权完成后以 `cohub-account: token scope must be a non-blank string` 失败，无法进入已登录状态。

## 决策

令牌响应的 scope 缺失、为 null 或为空白时，视为省略，并保留账号配置实际请求的 scope。非空响应 scope 仍具有优先权。已出现但不是字符串的值仍属于损坏数据并明确失败；这条兼容规则不会放宽对令牌、过期时间或已存会话字段的校验。

## 测试

账号服务测试以空白 token scope 完整执行真实的开始登录与轮询登录流程，随后断言认证成功，且持久化的私有会话保留请求的 `openid offline_access` scope。既有的损坏响应与刷新测试继续固定严格校验和会话生命周期行为。

## 备选方案

**统一拒绝所有空白响应字段。** 已否决：OAuth `scope` 是可选响应元数据，Cohub 用空字符串表示请求的授权范围未变化；拒绝它会把成功的令牌交换变成本地协议错误。

**持久化空白 scope。** 已否决：刷新请求需要有效授权范围，空值会丢失配置中的请求语义。

## 影响

Cohub 令牌端点返回空白 scope 时，登录可以完成；损坏的 scope 类型仍会显示为协议失败。持久化会话始终记录非空的有效 scope，供后续刷新使用。
