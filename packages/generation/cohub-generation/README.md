# @deepseek-ai/dsh-cohub-generation

English | [中文](README.zh.md)

Host-side DSH plugin for Cohub's authenticated multimodal generation API. It uses the single `@deepseek-ai/dsh-cohub-account` token owner and registers three model-facing tools without depending on Cohub Space/files, Board, or browser UI packages.

## Config

```yaml
- id: cohub-generation
  name: '@deepseek-ai/dsh-cohub-generation'
  config:
    spaceId: 00000000-0000-0000-0000-000000000000
    apiBaseUrl: https://api.cohub.run
    pollIntervalMs: 1500
    timeoutMs: 1800000
```

`spaceId` is required because Cohub authorizes, attributes, archives, and bills each generation in a Space. It does not grant local Workspace, cwd, Shell, file-sync, Session, or Work-publication behavior. The timeout stops local waiting only; it does not cancel or recreate the server task.

## Tools

`cohub_generation_models` reads the authenticated multimodal catalog. Normal discovery filters declarations marked hidden; an explicit flag includes them. Dynamic parameter and metadata declarations are returned as validated JSON strings so their exact server-owned fields remain available without weakening the DSH tool output contract.

`cohub_generate` creates exactly one billable task and polls it until completion, failure, cancellation, or the configured local timeout. Prompts, public media references, declaration-owned parameters, and declaration-owned metadata are accepted. The create request is never retried because Cohub exposes no caller idempotency key.

`cohub_generation_status` reads an existing task without creating or billing another task. If waiting fails after creation, the error retains the task ID so the same task can be recovered through this tool.

Completed image URLs remain in the canonical result. When a DSH attachment store is mounted, the plugin also downloads and validates generated images, enforces the store's byte and media limits, and persists them before returning an image block. A download failure keeps the original URL and returns an explicit attachment warning. Inline base64 images require the attachment store. Video and audio outputs remain provider URLs because DSH `0.1.0-rc.5` has no durable video or audio attachment seam.

The Cohub bearer token appears only in Host request headers. Catalogs, tool arguments, task IDs, outputs, attachment metadata, response content, and plugin-authored logs contain no credential value. Unloading aborts active requests and waits for owned work to settle.

## Model Experience

### Generation catalog

#### What the model sees

The model receives exact Cohub model ids, titles, descriptions, accepted media types, and the server-owned `parametersJson` and optional `metaJson` declarations. Hidden models appear only when explicitly requested.

#### Token effect

Catalog size is the direct token cost. The tool returns declarations without adapter-authored examples or inferred defaults.

#### KV Cache effect

An unchanged catalog result can preserve the preceding prompt prefix. Catalog changes alter only the returned tool-result suffix.

### Generation request

#### What the model sees

The generating Cohub model receives the caller's prompt, ordered public media references, parameters, and model-owned metadata without extra prompt prose. Cohub owns provider selection behind the exact model id.

#### Token effect

Generation models apply their own text and media accounting. DSH does not reinterpret Cohub's provider price or billing result.

#### KV Cache effect

Multimodal generation tasks do not use the conversational LLM prefix cache. Reusing a prompt does not cause this plugin to reuse or deduplicate a billable task.

### Generated result

#### What the model sees

Text and media URLs return in a structured tool result. Persisted generated images also return as DSH image blocks, so an image-capable conversational route can inspect them in the next request.

#### Token effect

Result metadata and URLs consume ordinary tool-result tokens. Image tokenization is controlled by the next conversational model that receives the persisted image block.

#### KV Cache effect

The durable tool result and image reference become part of later DSH history. Pending, failed, malformed, aborted, or locally timed-out polling does not fabricate a completed result.

## Known Limitations and Deferred Work

- Cohub's raw-completion adapter currently rejects DSH tools because the raw-completion contract has no tool schema or tool-history support. These generation tools are usable with another DSH conversational provider that supports tools; they do not hand execution to Cohub Sessions.
- Input references are public HTTP or HTTPS media URLs. Uploading local files, private URL exchange, and Space-file materialization are outside this independent package.
- DSH `0.1.0-rc.5` has a durable image attachment seam but no equivalent video or audio seam. Inline base64 video or audio therefore fails explicitly with the recoverable task ID.
- Local timeout or cancellation stops polling, not the server generation. Use `cohub_generation_status` with the retained task ID instead of creating a duplicate billable task.
- The package does not place outputs on a Board, mutate Space files, create Sessions, publish Works, or expose Cohub remote execution.
