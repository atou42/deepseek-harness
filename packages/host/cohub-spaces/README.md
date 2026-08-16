# @deepseek-ai/dsh-cohub-spaces

English | [中文](README.zh.md)

Host-side Cohub Space adapter. It uses the sole `ctx.cohubAccount` owner for access tokens, validates every platform response, and exposes typed Remote methods for listing accessible Spaces, paginated Sessions and Turns, relative-tree and text-file operations, resolving the separate local cwd anchor, and binding a Space to a live blank DSH Session. Binding keeps the ordinary DSH Agent and local tools, then adds Space-scoped list, read, compare-and-set write, and command tools. A Space remains a remote semantic root; this package never maps its paths onto the local filesystem, runs a sync loop, or publishes Works.

The implementation calls the Cohub platform HTTP API directly and has no Cohub CLI or SDK dependency. Space, Session, and file identifiers cross the browser boundary, but account credentials do not. Session pagination rejects repeated cursors, duplicate identities, and cross-Space rows instead of returning a partial list; an empty Session title remains valid and the browser derives its display name. File revisions preserve the platform's millisecond timestamp, including fractional milliseconds, together with the byte size. Binary and URL-delivered files fail explicitly. A stale write returns the current remote text and revision instead of overwriting it. Commands poll their Cohub task to a completed or failed terminal state within configured bounds.

## Configuration

- `apiBaseUrl` selects the Cohub HTTP origin and defaults to the account package's platform origin.
- `localCwd` selects the local DSH Workspace paired with a Cohub-bound Session and defaults to the Host process working directory. It must be absolute.
- `runPollIntervalMs` controls command-task polling from 100 to 10,000 ms and defaults to 1,000 ms.
- `runTimeoutMs` bounds a command from 1,000 to 3,600,000 ms and defaults to 120,000 ms.

## Model Experience

None, as the adapter changes no global model configuration; binding adds one durable instruction and four tools only to the selected DSH Agent. The Agent keeps its normal local context and tools, so one DSH conversation can operate on local files and the attached Cohub Space.

#### KV Cache effect

The binding instruction and four tool schemas add a small stable prefix to each request in that Session. Tool results enter normal DSH history and follow its compaction behavior.

## Known Limitations and Deferred Work

- This adapter handles existing Space trees, inline UTF-8 text, and bounded one-shot commands. Upload, delete, move, persistent terminals, silent sync, and Work publication are outside its contract.
