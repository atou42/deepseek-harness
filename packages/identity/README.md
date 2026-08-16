# identity/ — shared identity

English | [中文](README.zh.md)

Identity capabilities shared across product domains. Anonymous correlation and explicit authenticated accounts remain separate packages with different storage and exposure boundaries.

| Package | Role | ctx key |
|---|---|---|
| [`anonymous-user-id/`](anonymous-user-id/README.md) | Persists one anonymous Harness-home correlation id for telemetry, feedback, and DeepSeek requests | — |
| [`cohub-account/`](cohub-account/README.md) | Owns one Host-side Cohub login, private session, refresh, and logout lifecycle | `cohubAccount` |
