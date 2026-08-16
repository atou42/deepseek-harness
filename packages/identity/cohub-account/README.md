# @deepseek-ai/dsh-cohub-account

English | [中文](README.zh.md)

Host-side owner of one Cohub account session. It performs Logto device authorization, stores the complete private session behind one DSH credential reference, single-flights refresh, and clears local state before reporting remote revocation failure. Cohub adapters obtain access tokens only through `ctx.cohubAccount.getAccessToken()`; browser-facing consumers receive the token-free snapshot and public device authorization fields.

Malformed stored sessions fail plugin initialization and are never cleared or replaced automatically. An unrecoverable refresh rejection removes the stored session and requires a new sign-in. A transient refresh failure remains visible while preserving the stored session for a later retry. If token exchange succeeds but profile loading fails, the exchanged private session stays in memory so retrying does not reuse the one-time device code. Logout cannot be undone by a late login or refresh result.

This package implements the protocol with platform HTTP APIs and has no dependency on the Cohub CLI or SDK. Its own source and package metadata remain MIT; downstream distributions must still account for the licenses of the DSH packages they compose.

## Model Experience

None, as account state and credentials are Host capabilities and are never injected into model-visible context.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The Host package exposes token-free account operations through its generated Remote. Browser polling is owned by the optional `@deepseek-ai/dsh-client-cohub-account` package, so Host consumers can use identity without loading that UI.
