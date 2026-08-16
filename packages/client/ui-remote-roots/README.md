# @deepseek-ai/dsh-client-ui-remote-roots

English | [中文](README.zh.md)

Anonymous, provider-neutral remote-root and history UI for DSH. It renders marked remote roots beside local Workspaces and opens provider-owned Session rows in a read-only history inspector while keeping every identity opaque. Root selection stays in the ordinary DSH workbench. This package never creates a local Workspace, cwd, local path, account, or credential.

Providers register data and operations through `@deepseek-ai/dsh-client-remote-roots`. This package owns presentation, lazy listing, Session selection, history rendering, cancellation, retry, and slot disposal. It has no provider prompt composer. Removing it leaves provider registration intact; removing a provider withdraws its roots without changing local Workspace state.

## Model Experience

None, as the inspector never sends a prompt and the ordinary DSH workbench owns new messages.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Provider Session history is a point-in-time read. Live provider event streaming and detailed tool-progress projection remain deferred.
