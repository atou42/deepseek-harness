# @deepseek-ai/dsh-client-ui-remote-roots

English | [中文](README.zh.md)

Anonymous, provider-neutral remote-root and conversation UI for DSH. It renders marked remote roots beside local Workspaces and keeps every provider identity opaque. A remote root exposes only its provider-owned cloud conversation action. Provider Session rows replace the native DSH center column with that conversation instead of opening a drawer; interactive sources receive the familiar header, transcript, composer, model and thinking-effort controls, near-real-time polling, and abort control. This package never starts a local DSH Session from a remote root, creates an account or credential, or invents a local path.

Providers register data and operations through `@deepseek-ai/dsh-client-remote-roots`. This package owns presentation, lazy listing, Session selection, history rendering, prompt submission, polling, cancellation, idempotent unknown-outcome retry, and slot disposal. Removing it leaves provider registration intact; removing a provider withdraws its roots without changing local Workspace state.

## Model Experience

The composer reads the provider's validated model catalog and sends an optional model and thinking-effort override with the next provider Turn. Leaving either control at its Cohub default sends no invented value. The provider still owns prompt assembly and execution.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Provider conversations currently use bounded polling rather than a live event stream. Detailed provider tool-progress projection remains deferred.
