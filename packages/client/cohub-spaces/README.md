# @deepseek-ai/dsh-client-cohub-spaces

English | [中文](README.zh.md)

Browser-side Cohub provider for `@deepseek-ai/dsh-client-remote-roots`. Each accessible Space becomes a conversational root marked `Cohub`; expanding it lists that Space's Cohub Sessions, never its files. It maps Session history and prompt submission through opaque browser identities, including first-prompt Session creation. All operations travel through the typed Host Remote adapter, so credentials never enter this package or browser state.

Loading, account-change refresh, stale completion fencing, Session-list aborts, and provider disposal are owned here. The provider reads the token-free account snapshot before Space I/O: an anonymous or incomplete login publishes the non-error Cohub authentication-required state, and the existing account-change event loads Spaces after sign-in. Transport failures remain explicit errors. Removing this plugin withdraws only the Cohub source. It does not remove the generic tree, change a local Workspace, alter cwd, or create a Shell target.

## Model Experience

None, as this browser-side provider registers no prompt, tool, or model-visible context.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The current surface lists Sessions but does not yet open their turn history or send a follow-up. Those are separate Cohub conversation capabilities; file browsing is intentionally absent from Space navigation.
