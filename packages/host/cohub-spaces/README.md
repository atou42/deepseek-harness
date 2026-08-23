# @deepseek-ai/dsh-cohub-spaces

English | [中文](README.zh.md)

Host-side Cohub Space adapter. It uses the sole `ctx.cohubAccount` owner for access tokens, validates every platform response, and exposes typed Remote methods for listing accessible Spaces, paginated Sessions and Turns, submitting and aborting native Cohub Agent Turns, and relative-tree, text-file, and command operations. Every local DSH Agent receives four Cohub tools: ordinary Sessions must supply the exact `space_id` from an `@Cohub Space` reference, while legacy bound Sessions may omit it. A Space remains a remote semantic root; this package never maps its paths onto the local filesystem, runs a sync loop, or publishes Works.

The implementation calls the Cohub platform HTTP API directly and has no Cohub CLI or SDK dependency. Space, Session, Turn, model, and file identifiers cross the browser boundary, but account credentials do not. Native prompts require a caller-generated `clientMessageId`, may carry a validated provider/model pair and Cohub thinking level, accept only Cohub's immediate Session/Turn response, and verify Space ownership before aborting a Turn. Session pagination rejects repeated cursors, duplicate identities, malformed title types, and cross-Space rows instead of returning a partial list; an empty or null Session title is projected as untitled and the browser derives its display name. File revisions preserve the platform's millisecond timestamp, including fractional milliseconds, together with the byte size. Binary and URL-delivered files fail explicitly. A stale write returns the current remote text and revision instead of overwriting it. Commands poll their Cohub task to a completed or failed terminal state within configured bounds.

## Configuration

- `apiBaseUrl` selects the Cohub HTTP origin and defaults to the account package's platform origin.
- `localCwd` selects the local DSH Workspace paired with a Cohub-bound Session and defaults to the Host process working directory. It must be absolute.
- `runPollIntervalMs` controls command-task polling from 100 to 10,000 ms and defaults to 1,000 ms.
- `runTimeoutMs` bounds a command from 1,000 to 3,600,000 ms and defaults to 120,000 ms.

## Model Experience

For native cloud Turns, the adapter validates Cohub's model catalog and the optional provider/model and thinking-level override before forwarding them. It does not invent defaults. Local DSH Agents remain unchanged: they receive only the stable `@Cohub Space` instruction and four explicit cloud tools.

#### KV Cache effect

The reference instruction and four tool schemas add a small stable prefix to each local Session request. A concrete Space title and id enter only the turn that references it. Tool results enter normal DSH history and follow its compaction behavior.

## Known Limitations and Deferred Work

- This adapter handles existing Space trees, inline UTF-8 text, and bounded one-shot commands. Upload, delete, move, persistent terminals, silent sync, and Work publication are outside its contract.
