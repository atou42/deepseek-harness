# @deepseek-ai/dsh-client-cohub-spaces

English | [中文](README.zh.md)

Browser-side Cohub provider for `@deepseek-ai/dsh-client-remote-roots`. Each accessible Space becomes a folder-like root marked `Cohub`; child identifiers remain provider-owned opaque values. All operations travel through the typed Host Remote adapter, so credentials never enter this package or browser state.

Loading, account-change refresh, stale completion fencing, operation aborts, and provider disposal are owned here. Removing this plugin withdraws only the Cohub source. It does not remove the generic tree, change a local Workspace, alter cwd, or create a Shell target.

## Model Experience

None, as this browser-side provider registers no prompt, tool, or model-visible context.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The generic tree currently presents browsing only. Text read/write methods exist at the capability seam for later editors, while upload, move, delete, sync, and remote execution remain unsupported.
