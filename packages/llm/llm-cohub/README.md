# @deepseek-ai/dsh-llm-cohub

English | [中文](README.zh.md)

Host-side DSH LLM adapter for Cohub's authenticated raw-completion API. The package obtains short-lived access tokens only from `@deepseek-ai/dsh-cohub-account`, reads the account's available Cohub model catalog, and exposes one DSH provider route named `cohub`. It does not depend on the Cohub Space/files or browser UI packages.

Each advertised DSH model id is an opaque JSON pair containing the underlying Cohub provider and model id. Selectors show the catalog name, while requests recover the exact pair and send it to `POST /api/spaces/:spaceId/completions`. This avoids collisions between model ids owned by different Cohub providers.

## Config

```yaml
- id: llm-cohub
  name: '@deepseek-ai/dsh-llm-cohub'
  config:
    spaceId: 00000000-0000-0000-0000-000000000000
    apiBaseUrl: https://api.cohub.run
    streamIdleTimeoutMs: 300000
```

`spaceId` is required because Cohub authorizes, attributes, archives, and bills raw completions in a Space. It is routing context only: this package does not browse or mutate that Space's files. `apiBaseUrl` defaults to the same Cohub API origin as the account package. The five-minute stream idle limit covers the initial request and every outstanding stream read.

The adapter reads `GET /api/models` for each catalog or exact-model query, so account changes and server catalog changes reach the next query without a process restart. Hidden models are excluded. Context capacity, output limit, reasoning support, and input modalities are validated before publication. Image input is advertised only when DSH's durable attachment service is mounted; referenced bytes are read, verified, and sent as base64 only for the current request.

The Cohub endpoint creates billable completions without accepting a caller idempotency key. The adapter therefore registers zero automatic retries. HTTP, authentication, billing, malformed-response, truncation, timeout, and cancellation outcomes stay explicit. Unloading the plugin aborts active requests and removes the provider route through Cordis lifecycle ownership.

Every request carries DSH's standard app-attribution headers. The Cohub bearer token exists only in the Host request header. It never enters model ids, messages, catalog data, response chunks, browser bundles, or logs authored by this package.

## Model Experience

### Cohub request

#### What the model sees

The selected Cohub model receives the DSH system prompt, ordered text and reasoning history, optional user images, and supported call configuration without adapter-authored prompt prose. The underlying Cohub `provider` and `model` are selected from the opaque advertised model id.

#### Token effect

Provider tokenization governs exact input. Image encoding changes transport size but not the model-visible image, and Cohub reports disjoint input, output, cache-read, and cache-write counts when available.

#### KV Cache effect

An unchanged system-and-history prefix remains eligible for the selected Cohub provider's cache. Switching the underlying provider or model selects a different cache domain; changing any earlier prompt or message may prevent reuse from the first changed token.

### Cohub response

#### What the model sees

Cohub reasoning and visible text events become DSH reasoning and text chunks. The final Cohub message must agree with streamed deltas before the adapter publishes a successful finish.

#### Token effect

Generated tokens follow the resolved reasoning effort and output limit. Only blocks retained by the DSH loop enter later requests.

#### KV Cache effect

Retained response blocks append to the next request while preserving the earlier prefix. Malformed, failed, aborted, or truncated replies never become successful cached history.

## Known Limitations and Deferred Work

- Cohub's current raw-completion endpoint does not accept tool schemas and its runtime does not preserve tool-call history. The adapter fails before network I/O when a DSH request contains tools, tool calls, or tool results. Using Cohub Sessions as a substitute would hand execution to Cohub's own agent runtime and is intentionally out of scope.
- Cohub raw completion does not expose stop sequences. A non-empty DSH stop list fails before network I/O.
- Assistant-side images are rejected because the current Cohub completion runtime preserves images only in user input.
- The required Space is explicit configuration rather than inferred from the browser's selected cloud folder, keeping the LLM package independently loadable from Space/files and UI plugins.
