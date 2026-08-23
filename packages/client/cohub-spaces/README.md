# @deepseek-ai/dsh-client-cohub-spaces

English | [中文](README.zh.md)

Browser-side Cohub provider for `@deepseek-ai/dsh-client-remote-roots`. Each accessible Space becomes a remote root marked `Cohub`; expanding it lists that Space's Cohub Sessions, never its files. Selecting the root enters only the native Cohub Agent conversation; Cohub owns submitted, polled, and aborted Turns. The package also registers the same Spaces as searchable `@` references in ordinary local DSH composers so one Session can access selected cloud assets on demand. Existing Cohub Session history and new cloud Sessions use opaque browser identities. Credentials never enter this package or browser state.

Loading, account-change refresh, stale completion fencing, Session-list aborts, and provider disposal are owned here. The provider reads the token-free account snapshot before Space I/O: an anonymous or incomplete login publishes the non-error Cohub authentication-required state, and the existing account-change event loads Spaces after sign-in. Transport failures remain explicit errors. Removing this plugin withdraws only the Cohub source; the separately registered local Workspace remains ordinary DSH state.

## Model Experience

None, as this browser package does not change the selected model or execution owner; an `@Cohub Space` reference only serializes the selected Space title and id into that local prompt.

#### KV Cache effect

Reference text enters only the turn that selected the Space; the Host adapter owns the stable tool schemas.

## Known Limitations and Deferred Work

- Native interaction currently accepts text prompts and polls retained Turn state; provider attachments and detailed Cohub tool-progress projection are deferred. Space files remain absent from navigation and are available to a local DSH Agent through an `@Cohub Space` reference and scoped tools.
