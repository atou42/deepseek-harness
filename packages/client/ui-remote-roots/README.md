# @deepseek-ai/dsh-client-ui-remote-roots

English | [中文](README.zh.md)

Anonymous, provider-neutral remote-root and conversation UI for DSH. It renders marked remote roots beside local Workspaces and keeps every provider identity opaque. A remote root exposes only its provider-owned cloud conversation action. Provider Session rows open that conversation; interactive sources receive a dedicated composer, near-real-time polling, and abort control. This package never starts a local DSH Session from a remote root, creates an account or credential, or invents a local path.

Providers register data and operations through `@deepseek-ai/dsh-client-remote-roots`. This package owns presentation, lazy listing, Session selection, history rendering, prompt submission, polling, cancellation, idempotent unknown-outcome retry, and slot disposal. Removing it leaves provider registration intact; removing a provider withdraws its roots without changing local Workspace state.

## Model Experience

None, as this browser-side surface forwards user text to the selected owner without assembling or modifying its model prompt.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Provider conversations currently use bounded polling rather than a live event stream. Detailed provider tool-progress projection remains deferred.
