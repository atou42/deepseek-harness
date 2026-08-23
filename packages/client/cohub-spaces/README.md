# @deepseek-ai/dsh-client-cohub-spaces

English | [中文](README.zh.md)

Browser-side Cohub provider for `@deepseek-ai/dsh-client-remote-roots`. Each accessible Space becomes a remote root marked `Cohub`; expanding it lists that Space's Cohub Sessions, never its files. The provider exposes two separate operations: native Cohub Agent conversations submit, poll, and abort Cohub-owned Turns, while local DSH startup registers the Host-provided cwd as a Workspace, creates an ordinary DSH Session, and binds the Space before opening it. Existing Cohub Session history and new cloud Sessions use opaque browser identities. Credentials never enter this package or browser state.

Loading, account-change refresh, stale completion fencing, Session-list aborts, and provider disposal are owned here. The provider reads the token-free account snapshot before Space I/O: an anonymous or incomplete login publishes the non-error Cohub authentication-required state, and the existing account-change event loads Spaces after sign-in. Transport failures remain explicit errors. Removing this plugin withdraws only the Cohub source; the separately registered local Workspace remains ordinary DSH state.

## Model Experience

None, as this browser package only asks the Host adapter to bind the newly created DSH Session.

#### KV Cache effect

The Host-owned binding determines the stable model prefix and tool schemas.

## Known Limitations and Deferred Work

- Native interaction currently accepts text prompts and polls retained Turn state; provider attachments and detailed Cohub tool-progress projection are deferred. Space files remain absent from navigation and are available to the separately chosen local DSH Agent through scoped tools.
