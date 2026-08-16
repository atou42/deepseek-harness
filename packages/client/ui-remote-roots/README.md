# @deepseek-ai/dsh-client-ui-remote-roots

English | [中文](README.zh.md)

Anonymous, provider-neutral remote-root and conversation UI for DSH. It renders marked remote roots beside local Workspaces, opens provider-owned Session rows, and hosts a remote conversation workbench while keeping every identity opaque. It never creates a local Workspace, cwd, local path, Shell target, account, or credential.

Providers register data and operations through `@deepseek-ai/dsh-client-remote-roots`. This package owns presentation, lazy listing, Session selection, history rendering, prompt submission, active-Turn refresh, cancellation, retry, and slot disposal. Removing it leaves provider registration intact; removing a provider withdraws its roots without changing local Workspace state.

## Model Experience

Prompts entered in the remote workbench are sent to the selected provider-owned Session. The provider remains responsible for model choice, context, tools, and persistence.

#### KV Cache effect

Provider-dependent. This package does not assemble model context itself.

## Known Limitations and Deferred Work

- Turn updates currently use short polling after prompt acceptance. Provider event streaming and detailed tool-progress projection remain deferred.
