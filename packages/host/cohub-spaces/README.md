# @deepseek-ai/dsh-cohub-spaces

English | [中文](README.zh.md)

Host-side Cohub Space/files adapter. It uses the sole `ctx.cohubAccount` owner for access tokens, validates every platform response, and exposes typed Remote methods for listing accessible Spaces, browsing their relative trees, reading inline UTF-8 text, and compare-and-set text writes. A Space remains a remote semantic root; this package never creates a local Workspace, cwd, path mapping, Shell target, sync loop, or Work publication.

The implementation calls the Cohub platform HTTP API directly and has no Cohub CLI or SDK dependency. Space and file identifiers cross the browser boundary, but account credentials do not. Binary and URL-delivered files fail explicitly. A stale write returns the current remote text and revision instead of overwriting it.

## Model Experience

None, as this Host data adapter registers no prompt, tool, or model-visible context.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- This adapter handles existing Space trees and inline UTF-8 text only. Upload, delete, move, remote Shell, silent sync, and Work publication are intentionally outside its contract.
