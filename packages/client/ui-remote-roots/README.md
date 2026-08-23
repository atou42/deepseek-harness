# @deepseek-ai/dsh-client-ui-remote-roots

English | [中文](README.zh.md)

Anonymous, provider-neutral remote-root and conversation UI for DSH. It renders marked remote roots beside local Workspaces and keeps every provider identity opaque. A remote root exposes only its provider-owned cloud conversation action. Provider Session rows replace the native DSH center column with that conversation instead of opening a drawer; interactive sources receive the familiar header, transcript, composer, model and thinking-effort controls, near-real-time polling, and abort control. Structured thinking and tool activity use DSH disclosure rows, live status motion, expandable detail, and tail-follow behavior. Starting or opening a local Session deactivates the remote surface first, including when New Session reuses an existing blank Session. This package never starts a local DSH Session from a remote root, creates an account or credential, or invents a local path.

Providers register data and operations through `@deepseek-ai/dsh-client-remote-roots`. This package owns presentation, top-level filtering from the sidebar Workspace query, lazy listing, Session selection, history rendering, prompt submission, polling, cancellation, idempotent unknown-outcome retry, and slot disposal. Removing it leaves provider registration intact; removing a provider withdraws its roots without changing local Workspace state.

## Model Experience

None, as this browser-side package presents provider conversations and controls without assembling or changing a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Provider conversations currently use bounded polling rather than a browser event stream. Provider attachments can be rendered only when their content block contains a directly usable URL or base64 source.
