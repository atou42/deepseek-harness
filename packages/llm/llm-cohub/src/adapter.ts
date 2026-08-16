/** Cohub account-backed raw-completion adapter for the DSH LLM seam. */

import {
  attributionHeaders,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  QUOTA_EXCEEDED_CODE,
  resolveRetryPolicy,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import {
  COHUB_PROVIDER_ROUTE,
  parseCatalog,
  parseCohubModelId,
  toModelInfo,
  toResolvedModelInfo,
} from './protocol.ts'
import type { CohubCatalogModel } from './protocol.ts'
import { serializeCohubRequest } from './serialize.ts'
import { parseCohubSse, translateCohubEvents } from './sse.ts'

export interface CohubConnectionOptions {
  readonly apiBaseUrl: string
  readonly spaceId: string
  readonly streamIdleTimeoutMs: number
}

export interface CohubAdapterOptions {
  readonly connection: () => CohubConnectionOptions
  readonly resolveAccessToken: () => Promise<string>
  readonly resolveAttachments: () => AttachmentStore | undefined
  readonly fetch?: typeof globalThis.fetch
}

export const DEFAULT_COHUB_STREAM_IDLE_TIMEOUT_MS = 300_000
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'
const NO_RETRY: ResolvedRetryPolicy = resolveRetryPolicy({
  mode: 'normal',
  maxRetries: 0,
  retryableCodes: ['SERVER'],
}, 'llm-cohub: retryPolicy')

function apiErrorMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fallback
  const record = value as Record<string, unknown>
  if (typeof record.message === 'string' && record.message.trim().length > 0) return record.message
  if (typeof record.error === 'string' && record.error.trim().length > 0) return record.error
  if (typeof record.error === 'object' && record.error !== null && !Array.isArray(record.error)) {
    const message = (record.error as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return fallback
}

function errorDetail(value: unknown): string {
  if (typeof value !== 'object' || value === null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function httpErrorCode(status: number, data: unknown): string {
  if (status === 401 || status === 403) return 'AUTH'
  const detail = errorDetail(data)
  if (status === 402 || isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    return isContextWindowExceededError(detail) ? CONTEXT_WINDOW_EXCEEDED_CODE : 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  return `HTTP_${String(status)}`
}

function providerRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1_000
    return Number.isFinite(delay) && delay > 0 ? delay : undefined
  }
  const delay = Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

function requestId(headers: Headers): ReturnType<typeof ProviderRequestId> | undefined {
  const value = headers.get('x-request-id') ?? headers.get('x-trace-id')
  return value === null || value.length === 0 ? undefined : ProviderRequestId(value)
}

async function responseData(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    await response.text().catch(() => '')
    return undefined
  }
  try {
    return await response.json()
  } catch (error) {
    throw new LlmError(`Cohub HTTP ${String(response.status)} returned invalid JSON`, 'MALFORMED_RESPONSE', { cause: error })
  }
}

/** One account-backed route exposing Cohub's catalog through opaque model ids. */
export class CohubAdapter extends LlmAdapter {
  private readonly lifetime = new AbortController()
  private readonly requestFetch: typeof globalThis.fetch

  constructor(private readonly config: CohubAdapterOptions) {
    super()
    this.requestFetch = config.fetch ?? globalThis.fetch
  }

  close(): void {
    this.lifetime.abort(new Error('llm-cohub: adapter disposed'))
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Cohub' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    // A Cohub raw completion is billable and the endpoint has no caller idempotency key.
    return NO_RETRY
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (provider !== COHUB_PROVIDER_ROUTE) return []
    const models = await this.catalog(this.lifetime.signal)
    const imagesAvailable = this.config.resolveAttachments() !== undefined
    return Object.freeze(models.map(model => toModelInfo(model, imagesAvailable)))
  }

  override async resolveModel(
    provider: string,
    modelId: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    if (provider !== COHUB_PROVIDER_ROUTE) return { provider, id: modelId, name: modelId }
    const selected = parseCohubModelId(modelId)
    const requestSignal = signal === undefined
      ? this.lifetime.signal
      : AbortSignal.any([signal, this.lifetime.signal])
    const models = await this.catalog(requestSignal)
    const found = models.find(model => model.provider === selected.provider && model.id === selected.model)
    if (found === undefined) {
      return {
        provider,
        id: modelId,
        name: selected.model,
        description: `Cohub · ${selected.provider}`,
        inputModalities: ['text'],
      }
    }
    return toResolvedModelInfo(found, this.config.resolveAttachments() !== undefined)
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.provider !== COHUB_PROVIDER_ROUTE) {
      throw new LlmError(`llm-cohub cannot serve provider route "${options.provider}"`, 'INVALID_REQUEST')
    }
    const connection = this.config.connection()
    const selected = parseCohubModelId(options.model)
    const body = await serializeCohubRequest(options, this.config.resolveAttachments())
    const token = await this.accessToken()
    if (options.signal?.aborted) {
      throw new LlmError('Cohub request aborted by caller', 'ABORTED', { cause: options.signal.reason })
    }

    const consumer = new AbortController()
    const signals = [this.lifetime.signal, consumer.signal]
    if (options.signal !== undefined) signals.push(options.signal)
    const signal = AbortSignal.any(signals)
    using watchdog = idleWatchdog(signal, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(connection, body, token, selected, watchdog.signal, () => {
      watchdog.pulse()
    })[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(`Cohub stream idle timeout after ${String(connection.streamIdleTimeoutMs)}ms`, 'TIMEOUT', { cause: error })
      }
      if (options.signal?.aborted) {
        throw new LlmError('Cohub request aborted by caller', 'ABORTED', { cause: error })
      }
      if (this.lifetime.signal.aborted) {
        throw new LlmError('Cohub adapter was unloaded', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Cohub completion request to ${connection.apiBaseUrl} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('llm-cohub: stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer signal already owns the terminal outcome.
        }
      }
    }
  }

  private async * request(
    connection: CohubConnectionOptions,
    body: unknown,
    token: string,
    selected: { provider: string; model: string },
    signal: AbortSignal,
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const url = `${connection.apiBaseUrl}/api/spaces/${encodeURIComponent(connection.spaceId)}/completions`
    let response: Response
    try {
      response = await this.requestFetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...attributionHeaders(),
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (signal.reason !== undefined) throw signal.reason
      throw new LlmError(`Cohub API request to ${connection.apiBaseUrl} failed`, 'TRANSPORT', { cause: error })
    }
    if (!response.ok) {
      const data = await responseData(response)
      const delay = providerRetryAfterMs(response.headers.get('retry-after'))
      const id = requestId(response.headers)
      throw new LlmError(
        apiErrorMessage(data, `Cohub API error (HTTP ${String(response.status)})`),
        httpErrorCode(response.status, data),
        {
          status: response.status,
          ...delay === undefined ? {} : { providerRetryAfterMs: delay },
          ...id === undefined ? {} : { requestId: id },
        },
      )
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream')) {
      await response.text().catch(() => '')
      throw new LlmError('Cohub completion returned a non-SSE success response', 'MALFORMED_RESPONSE')
    }
    if (response.body === null) throw new LlmError('Cohub completion returned no response body', 'EMPTY_RESPONSE')
    yield* translateCohubEvents(parseCohubSse(response.body, onComment), selected)
  }

  private async catalog(signal: AbortSignal): Promise<readonly CohubCatalogModel[]> {
    const connection = this.config.connection()
    const token = await this.accessToken()
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('aborted')
    let response: Response
    try {
      response = await this.requestFetch(`${connection.apiBaseUrl}/api/models`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          ...attributionHeaders(),
        },
        signal,
      })
    } catch (error) {
      if (signal.reason !== undefined) throw signal.reason
      throw new LlmError(`Cohub model catalog request to ${connection.apiBaseUrl} failed`, 'TRANSPORT', { cause: error })
    }
    const data = await responseData(response)
    if (!response.ok) {
      const delay = providerRetryAfterMs(response.headers.get('retry-after'))
      const id = requestId(response.headers)
      throw new LlmError(
        apiErrorMessage(data, `Cohub API error (HTTP ${String(response.status)})`),
        httpErrorCode(response.status, data),
        {
          status: response.status,
          ...delay === undefined ? {} : { providerRetryAfterMs: delay },
          ...id === undefined ? {} : { requestId: id },
        },
      )
    }
    return parseCatalog(data)
  }

  private async accessToken(): Promise<string> {
    try {
      const token = await this.config.resolveAccessToken()
      if (typeof token !== 'string' || token.length === 0) {
        throw new TypeError('Cohub account returned an empty access token')
      }
      return token
    } catch (error) {
      if (error instanceof LlmError) throw error
      throw new LlmError('Cohub sign-in is required for this model route', 'AUTH', { cause: error })
    }
  }
}
