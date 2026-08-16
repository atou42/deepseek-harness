# @deepseek-ai/dsh-client-ui-remote-roots

English | [中文](README.zh.md)

Anonymous, provider-neutral remote folder tree for DSH. It renders marked remote roots beside local Workspaces while keeping every root and child identity opaque. It never creates a Workspace, cwd, local path, Shell target, account, or credential.

Providers register data and operations through `@deepseek-ai/dsh-client-remote-roots`. This package only owns presentation, lazy listing, cancellation, retry, and slot disposal. Removing it leaves provider registration intact; removing a provider withdraws its roots without changing local Workspace state.

## Model Experience

None, as this package is browser presentation and sends no model input.

#### KV Cache effect

None; it neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The tree is deliberately browse-only. Editing and provider-specific actions remain outside this anonymous presentation package.
