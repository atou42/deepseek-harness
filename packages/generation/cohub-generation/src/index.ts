/** Account-backed Cohub multimodal generation tools. */

import { Buffer } from 'node:buffer'
import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import {
  DEFAULT_COHUB_API_BASE_URL,
  type CohubAccountService,
} from '@deepseek-ai/dsh-cohub-account'
import { attributionHeaders, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {
  CohubGeneratedImageAttachment,
  CohubGenerationBilling,
  CohubGenerationModel,
  CohubGenerationOutput,
  CohubGenerationReference,
  CohubGenerationResult,
  CohubGenerationTaskStatus,
  GenerationMediaType,
} from './protocol.ts'

export type * from './protocol.ts'

export const name = 'cohub-generation'
export const inject = ['tools', 'systemPrompt', 'cohubAccount']
/** Default delay between Cohub generation task polls. */
export const DEFAULT_COHUB_GENERATION_POLL_INTERVAL_MS = 1_500
/** Default maximum time spent waiting for one Cohub generation task. */
export const DEFAULT_COHUB_GENERATION_TIMEOUT_MS = 30 * 60 * 1_000

/** Cohub generation plugin configuration. */
export interface Config {
  /** Cohub Space that owns generated tasks and outputs. */
  spaceId: string
  /** Cohub API origin. */
  apiBaseUrl?: string
  /** Delay between task-status polls in milliseconds. */
  pollIntervalMs?: number
  /** Maximum generation wait in milliseconds. */
  timeoutMs?: number
}

interface ResolvedConfig {
  readonly spaceId: string
  readonly apiBaseUrl: string
  readonly pollIntervalMs: number
  readonly timeoutMs: number
}

/** One validated Cohub generation request. */
export interface GenerateCohubOptions {
  readonly model: string
  readonly prompt: string
  readonly references?: readonly CohubGenerationReference[]
  readonly parameters?: Readonly<Record<string, JsonValue>>
  readonly meta?: Readonly<Record<string, JsonValue>>
}

/** Dependencies and configuration for a Cohub generation client. */
export interface CohubGenerationClientOptions {
  readonly account: CohubAccountService
  readonly attachments: () => AttachmentStore | undefined
  readonly config: Config
  readonly fetch?: typeof globalThis.fetch
}

interface JsonResponse {
  readonly response: Response
  readonly data: unknown
}

interface GenerationSource {
  readonly type: 'url' | 'base64'
  readonly url?: string
  readonly mediaType?: string
  readonly data?: string
}

interface RawOutputBlock {
  readonly type: 'text' | GenerationMediaType
  readonly text?: string
  readonly source?: GenerationSource
  readonly role?: string
}

/** Cohub generation HTTP rejection with normalized status and optional code. */
export class CohubGenerationHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(`cohub-generation: HTTP ${String(status)}${code === undefined ? '' : ` ${code}`}: ${message}`)
    this.name = 'CohubGenerationHttpError'
  }
}

/** Cohub generation failure that retains the billable task identity. */
export class CohubGenerationTaskError extends Error {
  constructor(readonly taskRunId: string, message: string, options?: ErrorOptions) {
    super(`cohub-generation: ${message}; task ID: ${taskRunId}`, options)
    this.name = 'CohubGenerationTaskError'
  }
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`cohub-generation: ${field} must be a non-blank string`)
  }
  return value
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`cohub-generation: ${field} must be a positive safe integer`)
  }
  return value
}

function normalizeUrl(value: string, field = 'apiBaseUrl'): string {
  const parsed = new URL(nonBlank(value, field).replace(/\/+$/, ''))
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError(`cohub-generation: ${field} must use HTTP or HTTPS`)
  }
  return parsed.toString().replace(/\/$/, '')
}

function resolveConfig(config: Config): ResolvedConfig {
  return Object.freeze({
    spaceId: nonBlank(config.spaceId, 'spaceId'),
    apiBaseUrl: normalizeUrl(config.apiBaseUrl ?? DEFAULT_COHUB_API_BASE_URL),
    pollIntervalMs: positiveInteger(
      config.pollIntervalMs ?? DEFAULT_COHUB_GENERATION_POLL_INTERVAL_MS,
      'pollIntervalMs',
    ),
    timeoutMs: positiveInteger(config.timeoutMs ?? DEFAULT_COHUB_GENERATION_TIMEOUT_MS, 'timeoutMs'),
  })
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`cohub-generation: ${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function jsonValue(value: unknown, field: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`cohub-generation: ${field} must contain finite numbers`)
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${field}[${String(index)}]`))
  const source = record(value, field)
  const output: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(source)) output[key] = jsonValue(item, `${field}.${key}`)
  return output
}

function jsonObject(value: unknown, field: string): Record<string, JsonValue> {
  const parsed = jsonValue(value, field)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`cohub-generation: ${field} must be an object`)
  }
  return parsed
}

function optionalRole(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return nonBlank(value, field)
}

function parseInputTypes(value: unknown, field: string): readonly ('text' | GenerationMediaType)[] {
  const declaration = record(value, field)
  const content = record(declaration.content, `${field}.content`)
  if (!Array.isArray(content.input)) throw new TypeError(`cohub-generation: ${field}.content.input must be an array`)
  const values = content.input.map((item, index) => {
    const spec = record(item, `${field}.content.input[${String(index)}]`)
    if (spec.type !== 'text' && spec.type !== 'image' && spec.type !== 'video' && spec.type !== 'audio') {
      throw new TypeError(`cohub-generation: ${field}.content.input[${String(index)}].type is invalid`)
    }
    return spec.type
  })
  return Object.freeze([...new Set(values)])
}

/**
 * Validate a Cohub multimodal generation catalog.
 * @param value - Untrusted API response.
 * @returns An immutable model catalog.
 */
export function parseGenerationCatalog(value: unknown): readonly CohubGenerationModel[] {
  if (!Array.isArray(value)) throw new TypeError('cohub-generation: model catalog must be an array')
  const ids = new Set<string>()
  return Object.freeze(value.map((item, index) => {
    const declaration = record(item, `model[${String(index)}]`)
    const model = nonBlank(declaration.model, `model[${String(index)}].model`)
    if (ids.has(model)) throw new TypeError(`cohub-generation: duplicate model "${model}"`)
    ids.add(model)
    if (declaration.schema !== 'neta.generation.model.v1') {
      throw new TypeError(`cohub-generation: model "${model}" has an unsupported schema`)
    }
    if (declaration.hidden !== undefined && typeof declaration.hidden !== 'boolean') {
      throw new TypeError(`cohub-generation: model "${model}" hidden must be boolean`)
    }
    const description = declaration.description === undefined
      ? undefined
      : nonBlank(declaration.description, `model "${model}" description`)
    const parameters = declaration.parameters === undefined
      ? {}
      : jsonObject(declaration.parameters, `model "${model}" parameters`)
    const meta = declaration.meta === undefined
      ? undefined
      : jsonValue(declaration.meta, `model "${model}" meta`)
    return Object.freeze({
      model,
      title: nonBlank(declaration.title, `model "${model}" title`),
      ...description === undefined ? {} : { description },
      hidden: declaration.hidden === true,
      inputTypes: parseInputTypes(declaration, `model "${model}"`),
      parametersJson: JSON.stringify(parameters),
      ...meta === undefined ? {} : { metaJson: JSON.stringify(meta) },
    })
  }))
}

async function responseData(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    await response.text().catch(() => '')
    if (response.ok) throw new TypeError(`cohub-generation: HTTP ${String(response.status)} returned non-JSON data`)
    return undefined
  }
  try {
    return await response.json()
  } catch (error) {
    throw new TypeError(`cohub-generation: HTTP ${String(response.status)} returned invalid JSON`, { cause: error })
  }
}

function apiError(value: unknown): { code?: string; message: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { message: 'request failed' }
  const body = value as Record<string, unknown>
  const code = typeof body.code === 'string' && body.code.trim().length > 0 ? body.code : undefined
  for (const candidate of [body.message, body.error]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return { ...code === undefined ? {} : { code }, message: candidate }
    }
  }
  return { ...code === undefined ? {} : { code }, message: 'request failed' }
}

function parseCreate(value: unknown): string {
  const body = record(value, 'create response')
  if (body.taskType !== 'generation' || body.status !== 'pending') {
    throw new TypeError('cohub-generation: create response has invalid task type or status')
  }
  return nonBlank(body.taskRunId, 'create response taskRunId')
}

function parseBilling(value: unknown): CohubGenerationBilling | null | undefined {
  if (value === undefined || value === null) return value
  const body = record(value, 'generation billing')
  const number = (item: unknown, field: string): number => {
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) {
      throw new TypeError(`cohub-generation: ${field} must be a non-negative finite number`)
    }
    return item
  }
  if (body.status !== 'recorded' && body.status !== 'overage' && body.status !== 'skipped') {
    throw new TypeError('cohub-generation: generation billing status is invalid')
  }
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
    throw new TypeError('cohub-generation: generation billing reason is invalid')
  }
  const discountMultiplier = body.discountMultiplier === undefined
    ? undefined
    : number(body.discountMultiplier, 'generation billing discountMultiplier')
  if (discountMultiplier !== undefined && discountMultiplier > 1) {
    throw new TypeError('cohub-generation: generation billing discountMultiplier exceeds 1')
  }
  return Object.freeze({
    amountUsd: number(body.amountUsd, 'generation billing amountUsd'),
    ...body.officialCostUsd === undefined
      ? {}
      : { officialCostUsd: number(body.officialCostUsd, 'generation billing officialCostUsd') },
    ...discountMultiplier === undefined ? {} : { discountMultiplier },
    usageType: nonBlank(body.usageType, 'generation billing usageType'),
    status: body.status,
    ...body.reason === undefined ? {} : { reason: body.reason },
  })
}

function parseSource(value: unknown, field: string): GenerationSource {
  const source = record(value, field)
  if (source.type === 'url') return { type: 'url', url: normalizeUrl(nonBlank(source.url, `${field}.url`), `${field}.url`) }
  if (source.type === 'base64') {
    return {
      type: 'base64',
      mediaType: nonBlank(source.mediaType, `${field}.mediaType`),
      data: nonBlank(source.data, `${field}.data`),
    }
  }
  throw new TypeError(`cohub-generation: ${field}.type is invalid`)
}

function parseRawOutput(value: unknown, index: number): RawOutputBlock {
  const field = `generation output[${String(index)}]`
  const block = record(value, field)
  const meta = block.meta === undefined ? undefined : record(block.meta, `${field}.meta`)
  const role = optionalRole(meta?.role, `${field}.meta.role`)
  if (block.type === 'text') {
    return { type: 'text', text: nonBlank(block.text, `${field}.text`), ...role === undefined ? {} : { role } }
  }
  if (block.type !== 'image' && block.type !== 'video' && block.type !== 'audio') {
    throw new TypeError(`cohub-generation: ${field}.type is invalid`)
  }
  return {
    type: block.type,
    source: parseSource(block.source, `${field}.source`),
    ...role === undefined ? {} : { role },
  }
}

function parseBase64(value: string, field: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TypeError(`cohub-generation: ${field} is malformed base64`)
  }
  return Buffer.from(value, 'base64')
}

function imageMediaType(value: string, field: string): ImageMediaType {
  if (value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif') return value
  throw new TypeError(`cohub-generation: ${field} is not a supported DSH image type`)
}

function attachmentValue(ref: ImageAttachmentRef): CohubGeneratedImageAttachment {
  return {
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...ref.name === undefined ? {} : { name: ref.name },
  }
}

async function boundedBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  const length = response.headers.get('content-length')
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
    throw new Error(`generated image exceeds the ${String(maxBytes)} byte attachment limit`)
  }
  if (response.body === null) throw new Error('generated image response has no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal.aborted) throw signal.reason
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) throw new Error(`generated image exceeds the ${String(maxBytes)} byte attachment limit`)
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function outputName(url: string): string | undefined {
  const name = basename(new URL(url).pathname)
  return name.length === 0 || name === '/' ? undefined : name
}

/** Strict, lifecycle-owned Cohub generation API client. */
export class CohubGenerationClient {
  private readonly spec: ResolvedConfig
  private readonly requestFetch: typeof globalThis.fetch
  private readonly lifetime = new AbortController()
  private readonly active = new Set<Promise<unknown>>()
  private closed = false

  constructor(private readonly options: CohubGenerationClientOptions) {
    this.spec = resolveConfig(options.config)
    this.requestFetch = options.fetch ?? globalThis.fetch
  }

  /**
   * List validated Cohub generation models.
   * @param includeHidden - Include models marked hidden by Cohub.
   * @param signal - Optional caller cancellation.
   * @returns The immutable generation model catalog.
   */
  listModels(includeHidden = false, signal?: AbortSignal): Promise<readonly CohubGenerationModel[]> {
    return this.track(this.listModelsImpl(includeHidden, signal))
  }

  /**
   * Create and wait for one Cohub generation task.
   * @param input - Validated model, prompt, references, and parameters.
   * @param signal - Optional caller cancellation.
   * @returns The completed result with stored image attachments when available.
   */
  generate(input: GenerateCohubOptions, signal?: AbortSignal): Promise<CohubGenerationResult> {
    return this.track(this.generateImpl(input, signal))
  }

  /**
   * Read one Cohub generation task status.
   * @param taskRunId - Cohub task identity.
   * @param signal - Optional caller cancellation.
   * @returns The validated current task state.
   */
  getTask(taskRunId: string, signal?: AbortSignal): Promise<CohubGenerationTaskStatus> {
    return this.track(this.getTaskImpl(nonBlank(taskRunId, 'taskRunId'), signal))
  }

  /** Abort active requests and wait for client-owned work to settle. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.lifetime.abort(new Error('cohub-generation: plugin disposed'))
    await Promise.allSettled([...this.active])
  }

  private async listModelsImpl(includeHidden: boolean, signal?: AbortSignal): Promise<readonly CohubGenerationModel[]> {
    if (typeof includeHidden !== 'boolean') throw new TypeError('cohub-generation: includeHidden must be boolean')
    const { data } = await this.request('/api/models?modelType=multimodal', {}, signal)
    const models = parseGenerationCatalog(data)
    return includeHidden ? models : Object.freeze(models.filter(model => !model.hidden))
  }

  private async generateImpl(input: GenerateCohubOptions, signal?: AbortSignal): Promise<CohubGenerationResult> {
    const model = nonBlank(input.model, 'model')
    const prompt = nonBlank(input.prompt, 'prompt')
    const references = (input.references ?? []).map((reference, index) => {
      const referenceType: unknown = reference.type
      if (referenceType !== 'image' && referenceType !== 'video' && referenceType !== 'audio') {
        throw new TypeError(`cohub-generation: references[${String(index)}].type is invalid`)
      }
      return {
        type: reference.type,
        source: { type: 'url', url: normalizeUrl(reference.url, `references[${String(index)}].url`) },
        ...reference.role === undefined ? {} : { meta: { role: nonBlank(reference.role, `references[${String(index)}].role`) } },
      }
    })
    const body = {
      spaceId: this.spec.spaceId,
      model,
      content: [{ type: 'text', text: prompt }, ...references],
      ...input.parameters === undefined ? {} : { parameters: jsonObject(input.parameters, 'parameters') },
      ...input.meta === undefined ? {} : { meta: jsonObject(input.meta, 'meta') },
    }
    const { data } = await this.request('/api/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, signal)
    const taskRunId = parseCreate(data)
    try {
      return await this.wait(taskRunId, signal)
    } catch (error) {
      if (error instanceof CohubGenerationTaskError) throw error
      throw new CohubGenerationTaskError(taskRunId, 'generation wait failed', { cause: error })
    }
  }

  private async wait(taskRunId: string, signal?: AbortSignal): Promise<CohubGenerationResult> {
    const startedAt = Date.now()
    while (true) {
      const status = await this.getTaskImpl(taskRunId, signal)
      if (status.status === 'completed') return status
      if (status.status === 'failed') throw new CohubGenerationTaskError(taskRunId, status.errorMessage)
      const remaining = this.spec.timeoutMs - (Date.now() - startedAt)
      if (remaining <= 0) throw new CohubGenerationTaskError(taskRunId, `generation timed out after ${String(this.spec.timeoutMs)}ms`)
      await this.sleep(Math.min(this.spec.pollIntervalMs, remaining), signal)
    }
  }

  private async getTaskImpl(taskRunId: string, signal?: AbortSignal): Promise<CohubGenerationTaskStatus> {
    const combined = this.signal(signal)
    const { data } = await this.request(`/api/tasks/${encodeURIComponent(taskRunId)}`, {}, combined)
    const body = record(data, 'task response')
    const run = record(body.run, 'task response run')
    if (run.id !== taskRunId) throw new TypeError('cohub-generation: task response id does not match request')
    if (run.taskType !== 'generation') throw new TypeError('cohub-generation: task response is not a generation task')
    const progressJson = body.progress === undefined || body.progress === null
      ? undefined
      : JSON.stringify(jsonValue(body.progress, 'task response progress'))
    if (run.status === 'pending' || run.status === 'running') {
      return Object.freeze({ taskRunId, status: run.status, ...progressJson === undefined ? {} : { progressJson } })
    }
    if (run.status === 'failed') {
      return Object.freeze({
        taskRunId,
        status: 'failed',
        errorMessage: nonBlank(run.errorMessage, 'failed task errorMessage'),
        ...progressJson === undefined ? {} : { progressJson },
      })
    }
    if (run.status !== 'completed') throw new TypeError('cohub-generation: task response status is invalid')
    const result = record(run.result, 'generation result')
    const model = nonBlank(result.model, 'generation result model')
    if (!Array.isArray(result.output)) throw new TypeError('cohub-generation: generation result output must be an array')
    const raw = result.output.map(parseRawOutput)
    const output = await Promise.all(raw.map((block, index) => this.materialize(block, index, combined, taskRunId)))
    const requestId = result.requestId === undefined ? undefined : nonBlank(result.requestId, 'generation result requestId')
    const cost = result.cost === undefined ? undefined : result.cost
    if (cost !== undefined && (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0)) {
      throw new TypeError('cohub-generation: generation result cost is invalid')
    }
    const billing = parseBilling(result.billing)
    return Object.freeze({
      taskRunId,
      status: 'completed',
      model,
      output: Object.freeze(output),
      ...requestId === undefined ? {} : { requestId },
      ...cost === undefined ? {} : { cost },
      ...billing === undefined ? {} : { billing },
      ...progressJson === undefined ? {} : { progressJson },
    })
  }

  private async materialize(
    block: RawOutputBlock,
    index: number,
    signal: AbortSignal,
    taskRunId: string,
  ): Promise<CohubGenerationOutput> {
    if (block.type === 'text') return Object.freeze({ type: 'text', text: block.text as string, ...block.role === undefined ? {} : { role: block.role } })
    const source = block.source as GenerationSource
    if (source.type === 'base64') {
      if (block.type !== 'image') {
        throw new CohubGenerationTaskError(taskRunId, `output ${String(index)} is inline ${block.type}; DSH has no durable ${block.type} attachment store`)
      }
      const attachments = this.options.attachments()
      if (attachments === undefined) {
        throw new CohubGenerationTaskError(taskRunId, `output ${String(index)} is an inline image; enable a DSH attachment store and inspect this task again`)
      }
      const mediaType = imageMediaType(source.mediaType as string, `generation output[${String(index)}].source.mediaType`)
      const data = parseBase64(source.data as string, `generation output[${String(index)}].source.data`)
      const ref = await attachments.saveImage({ data, mediaType })
      return Object.freeze({ type: 'image', attachment: attachmentValue(ref), ...block.role === undefined ? {} : { role: block.role } })
    }
    const url = source.url as string
    if (block.type !== 'image') return Object.freeze({ type: block.type, url, ...block.role === undefined ? {} : { role: block.role } })
    const attachments = this.options.attachments()
    if (attachments === undefined) return Object.freeze({ type: 'image', url, ...block.role === undefined ? {} : { role: block.role } })
    try {
      const response = await this.requestFetch(url, { signal, headers: attributionHeaders() })
      if (!response.ok) throw new Error(`image download failed with HTTP ${String(response.status)}`)
      const declared = response.headers.get('content-type')?.split(';', 1)[0]?.trim()
      if (declared === undefined || declared.length === 0) throw new Error('generated image response has no Content-Type')
      const mediaType = imageMediaType(declared, 'generated image Content-Type')
      if (!attachments.imageLimits.mediaTypes.includes(mediaType)) {
        throw new Error(`${mediaType} images are not accepted by this DSH attachment store`)
      }
      const data = await boundedBody(
        response,
        Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes),
        signal,
      )
      const name = outputName(url)
      const ref = await attachments.saveImage({ data, mediaType, ...name === undefined ? {} : { name } })
      return Object.freeze({ type: 'image', url, attachment: attachmentValue(ref), ...block.role === undefined ? {} : { role: block.role } })
    } catch (error) {
      if (signal.aborted) throw signal.reason
      const message = error instanceof Error ? error.message : String(error)
      return Object.freeze({
        type: 'image',
        url,
        attachmentWarning: `Generated image remains available at its URL, but DSH could not persist it: ${message}`,
        ...block.role === undefined ? {} : { role: block.role },
      })
    }
  }

  private async request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<JsonResponse> {
    if (this.closed) throw new Error('cohub-generation: client is disposed')
    const combined = this.signal(signal)
    const token = await this.options.account.getAccessToken()
    if (combined.aborted) throw combined.reason
    const headers = new Headers(init.headers)
    for (const [key, value] of Object.entries(attributionHeaders())) headers.set(key, value)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await this.requestFetch(`${this.spec.apiBaseUrl}${path}`, { ...init, headers, signal: combined })
    const data = await responseData(response)
    if (!response.ok) {
      const error = apiError(data)
      throw new CohubGenerationHttpError(response.status, error.code, error.message)
    }
    return { response, data }
  }

  private signal(signal?: AbortSignal): AbortSignal {
    return signal === undefined ? this.lifetime.signal : AbortSignal.any([this.lifetime.signal, signal])
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    const combined = this.signal(signal)
    if (combined.aborted) return Promise.reject(abortError(combined.reason))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        combined.removeEventListener('abort', abort)
        resolve()
      }, ms)
      const abort = () => {
        clearTimeout(timer)
        reject(abortError(combined.reason))
      }
      combined.addEventListener('abort', abort, { once: true })
    })
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.active.add(operation)
    void operation.finally(() => this.active.delete(operation)).catch(() => {})
    return operation
  }
}

function imageRef(value: CohubGeneratedImageAttachment): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(value.attachmentId),
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...value.name === undefined ? {} : { name: value.name },
  }
}

function abortError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error('cohub-generation: operation aborted', { cause: reason })
}

function resultContent(value: CohubGenerationResult): ContentBlock[] {
  const lines = [`Cohub generation ${value.taskRunId} completed with model ${value.model}.`]
  for (const [index, output] of value.output.entries()) {
    if (output.type === 'text') lines.push(`Output ${String(index + 1)} text:\n${output.text}`)
    else if (output.url !== undefined) lines.push(`Output ${String(index + 1)} ${output.type}: ${output.url}`)
    else lines.push(`Output ${String(index + 1)} ${output.type} persisted as a DSH attachment.`)
    if (output.type !== 'text' && output.attachmentWarning !== undefined) lines.push(output.attachmentWarning)
  }
  const blocks: ContentBlock[] = [{ type: 'text', text: lines.join('\n\n') }]
  for (const output of value.output) {
    if (output.type === 'image' && output.attachment !== undefined) {
      blocks.push({ type: 'image', attachment: imageRef(output.attachment) })
    }
  }
  return blocks
}

const attachmentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    attachmentId: { type: 'string', required: true },
    mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], required: true },
    bytes: { type: 'integer', required: true },
    width: { type: 'integer', required: true },
    height: { type: 'integer', required: true },
    name: { type: 'string' },
  },
} as const

const outputSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', const: 'text', required: true },
        text: { type: 'string', required: true },
        role: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['image', 'video', 'audio'], required: true },
        url: { type: 'string' },
        role: { type: 'string' },
        attachment: attachmentSchema,
        attachmentWarning: { type: 'string' },
      },
    },
  ],
} as const

const billingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    amountUsd: { type: 'number', required: true },
    officialCostUsd: { type: 'number' },
    discountMultiplier: { type: 'number' },
    usageType: { type: 'string', required: true },
    status: { type: 'string', enum: ['recorded', 'overage', 'skipped'], required: true },
    reason: { oneOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const

const resultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    taskRunId: { type: 'string', required: true },
    status: { type: 'string', const: 'completed', required: true },
    model: { type: 'string', required: true },
    output: { type: 'array', required: true, items: outputSchema },
    requestId: { type: 'string' },
    cost: { type: 'number' },
    billing: { oneOf: [billingSchema, { type: 'null' }] },
    progressJson: { type: 'string' },
  },
} as const

function deferGeneratedContext(exec: ToolRunContext, value: CohubGenerationResult): void {
  if (exec.parent === undefined) return
  exec.deferContext(createUserMessage({
    content: resultContent(value),
    source: { kind: 'plugin', plugin: name },
  }))
}

function toolResult(value: CohubGenerationResult & { readonly progressJson?: string }) {
  return {
    taskRunId: value.taskRunId,
    status: value.status,
    model: value.model,
    output: value.output.map(output => output.type === 'text'
      ? { type: output.type, text: output.text, ...output.role === undefined ? {} : { role: output.role } }
      : {
        type: output.type,
        ...output.url === undefined ? {} : { url: output.url },
        ...output.role === undefined ? {} : { role: output.role },
        ...output.attachment === undefined ? {} : { attachment: { ...output.attachment } },
        ...output.attachmentWarning === undefined ? {} : { attachmentWarning: output.attachmentWarning },
      }),
    ...value.requestId === undefined ? {} : { requestId: value.requestId },
    ...value.cost === undefined ? {} : { cost: value.cost },
    ...value.billing === undefined ? {} : { billing: value.billing === null ? null : { ...value.billing } },
    ...value.progressJson === undefined ? {} : { progressJson: value.progressJson },
  }
}

function toolStatus(value: CohubGenerationTaskStatus) {
  if (value.status === 'completed') return toolResult(value)
  if (value.status === 'failed') {
    return {
      taskRunId: value.taskRunId,
      status: value.status,
      errorMessage: value.errorMessage,
      ...value.progressJson === undefined ? {} : { progressJson: value.progressJson },
    }
  }
  return {
    taskRunId: value.taskRunId,
    status: value.status,
    ...value.progressJson === undefined ? {} : { progressJson: value.progressJson },
  }
}

/** Register independently unloadable Cohub generation tools. */
export function apply(ctx: Context, config: Config): void {
  const client = new CohubGenerationClient({
    account: ctx.cohubAccount,
    attachments: () => ctx.get('attachments'),
    config,
  })
  const timeoutMs = resolveConfig(config).timeoutMs
  ctx.effect(() => () => client.close(), 'cohub-generation: close client')
  ctx.systemPrompt.section({
    name: 'tool:cohub-generation',
    order: 145,
    text: 'Cohub multimodal generation is billable. Call cohub_generation_models before choosing a model or parameters. cohub_generate creates exactly one task and waits for it; if waiting fails after creation, recover with cohub_generation_status and the task ID from the error instead of creating a duplicate task.',
  })

  ctx.tools.register(defineTool({
    name: 'cohub_generation_models',
    description: 'List Cohub image, video, audio, and other multimodal generation models with their accepted inputs and parameter declarations.',
    parameters: {
      include_hidden: { type: 'boolean', description: 'Include models hidden from normal discovery. Defaults to false.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          models: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                model: { type: 'string', required: true },
                title: { type: 'string', required: true },
                description: { type: 'string' },
                hidden: { type: 'boolean', required: true },
                inputTypes: { type: 'array', required: true, items: { type: 'string', enum: ['text', 'image', 'video', 'audio'] } },
                parametersJson: { type: 'string', required: true },
                metaJson: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const models = await client.listModels(args.include_hidden ?? false, exec.signal)
      return { models: models.map(model => ({ ...model, inputTypes: [...model.inputTypes] })) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cohub_generate',
    description: 'Create one billable Cohub multimodal generation task and wait for its result. Reuse the returned task ID after interrupted polling; do not create a duplicate task.',
    parameters: {
      model: { type: 'string', required: true, description: 'Exact model id from cohub_generation_models.' },
      prompt: { type: 'string', required: true, description: 'Generation prompt.' },
      references: {
        type: 'array',
        description: 'Optional public media URL inputs.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['image', 'video', 'audio'], required: true },
            url: { type: 'string', required: true },
            role: { type: 'string', description: 'Optional declaration-specific role such as first_frame or reference_image.' },
          },
        },
      },
      parameters: { type: 'object', additionalProperties: true, description: 'Model parameters from its declaration.' },
      meta: { type: 'object', additionalProperties: true, description: 'Model-owned metadata from its declaration.' },
    },
    output: {
      schema: resultSchema,
      render: (_args, value) => resultContent(value),
    },
    timeoutMs,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const value = await client.generate(args, exec.signal)
      deferGeneratedContext(exec, value)
      return toolResult(value)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cohub_generation_status',
    description: 'Inspect one existing Cohub generation task by task ID without creating or billing another task.',
    parameters: {
      task_run_id: { type: 'string', required: true, description: 'Task ID returned by cohub_generate or its error.' },
    },
    output: {
      schema: {
        oneOf: [
          resultSchema,
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              taskRunId: { type: 'string', required: true },
              status: { type: 'string', enum: ['pending', 'running'], required: true },
              progressJson: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              taskRunId: { type: 'string', required: true },
              status: { type: 'string', const: 'failed', required: true },
              errorMessage: { type: 'string', required: true },
              progressJson: { type: 'string' },
            },
          },
        ],
      },
      render: (_args, value) => value.status === 'completed'
        ? resultContent(value)
        : [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const value = await client.getTask(args.task_run_id, exec.signal)
      if (value.status === 'completed') deferGeneratedContext(exec, value)
      return toolStatus(value)
    },
  }))
}

export const Config: z<Config> = z.object({
  spaceId: z.string(),
  apiBaseUrl: z.string().default(DEFAULT_COHUB_API_BASE_URL),
  pollIntervalMs: z.number().step(1).min(1).default(DEFAULT_COHUB_GENERATION_POLL_INTERVAL_MS),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_COHUB_GENERATION_TIMEOUT_MS),
})
