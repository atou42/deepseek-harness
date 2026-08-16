# @deepseek-ai/dsh-client-remote-roots

English | [中文](README.zh.md)

Generic browser-side capability seam for remote roots. A provider registers an observable list of explicitly marked roots plus opaque-ID browse/read/write and optional conversation callbacks. The contract contains no local path and never creates a local Workspace, changes a Session cwd, or supplies Shell execution. The registry owns the selected remote conversation target, routes history and prompts to the provider, rejects malformed publications and results, and withdraws state and subscriptions when the provider unloads. An expected missing login is a provider-labelled authentication-required state rather than an error; transport failures, mismatched identities, duplicate entries, invalid metadata, and unsupported outcomes still fail explicitly.

## Model Experience

None, as the registry is presentation-side data access and never injects model-visible context.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- No presentation plugin is included in this package. Board documents and generated assets use separate generic capability seams rather than widening the filesystem-like contract.
