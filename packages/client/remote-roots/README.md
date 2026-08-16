# @deepseek-ai/dsh-client-remote-roots

English | [中文](README.zh.md)

Generic browser-side capability seam for remote roots. A provider registers an observable list of explicitly marked roots plus opaque-ID browse/read/write, optional DSH-session startup, and optional read-only conversation history. The contract contains no local path and never adopts a root as a local Workspace or changes a Session cwd. Root activation awaits the provider's DSH startup callback before publishing selection; Session leaves open only provider history. The registry rejects malformed publications and results, and withdraws state and subscriptions when the provider unloads. An expected missing login is a provider-labelled authentication-required state rather than an error; transport failures, mismatched identities, duplicate entries, invalid metadata, and unsupported outcomes still fail explicitly.

## Model Experience

None, as the registry is presentation-side data access and never injects model-visible context.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- No presentation plugin is included in this package. Board documents and generated assets use separate generic capability seams rather than widening the filesystem-like contract.
