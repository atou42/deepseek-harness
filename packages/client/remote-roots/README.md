# @deepseek-ai/dsh-client-remote-roots

English | [中文](README.zh.md)

Generic browser-side capability seam for remote roots. A provider registers an observable list of explicitly marked roots plus opaque-ID browse/read/write callbacks. The contract contains no local path and never creates a Workspace, changes a Session cwd, or supplies Shell execution. The registry rejects duplicate sources and malformed publications, routes operations to the owning provider, and withdraws both state and subscriptions when the provider plugin unloads. Provider snapshots and operation results are validated, cloned, and deeply frozen at the boundary. An expected missing login is a provider-labelled authentication-required state rather than an error; transport failures, mismatched identities, duplicate entries, invalid metadata, malformed text responses, and unsupported write outcomes still fail explicitly.

## Model Experience

None, as the registry is presentation-side data access and never injects model-visible context.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- No presentation plugin is included in this package. Board documents and generated assets use separate generic capability seams rather than widening the filesystem-like contract.
