# @deepseek-ai/dsh-client-cohub-spaces

English | [中文](README.zh.md)

Browser-side Cohub provider for `@deepseek-ai/dsh-client-remote-roots`. Each accessible Space becomes a DSH-workspace root marked `Cohub`; expanding it lists that Space's Cohub Sessions, never its files. Selecting the Space idempotently registers the Host-provided local cwd as a local Workspace, creates an ordinary DSH Session in it, binds the Space through the Host adapter, and opens the DSH workbench only after binding succeeds. Existing Cohub Session history remains available through opaque browser identities as a read-only inspector. Credentials never enter this package or browser state.

Loading, account-change refresh, stale completion fencing, Session-list aborts, and provider disposal are owned here. The provider reads the token-free account snapshot before Space I/O: an anonymous or incomplete login publishes the non-error Cohub authentication-required state, and the existing account-change event loads Spaces after sign-in. Transport failures remain explicit errors. Removing this plugin withdraws only the Cohub source; the separately registered local Workspace remains ordinary DSH state.

## Model Experience

None, as this browser package only asks the Host adapter to bind the newly created DSH Session.

#### KV Cache effect

The Host-owned binding determines the stable model prefix and tool schemas.

## Known Limitations and Deferred Work

- Cohub Session history is read-only. New work happens in the bound DSH Session; Space files remain absent from navigation and are available to that Agent through scoped tools.
