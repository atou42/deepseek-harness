/** Cohub model-catalog and raw-completion wire validation. */

import { LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {
  FinishReason,
  LlmModelInfo,
  LlmResolvedModelInfo,
  ModelModality,
  TokenUsage,
} from '@deepseek-ai/dsh-llm'

export const COHUB_PROVIDER_ROUTE = 'cohub'

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type CohubThinkingLevel = typeof THINKING_LEVELS[number]
const THINKING_LEVEL_SET = new Set<string>(THINKING_LEVELS)

export interface CohubCatalogModel {
  readonly provider: string
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly input: readonly ('text' | 'image')[]
  readonly contextWindow?: number
  readonly maxTokens?: number
  readonly reasoning: boolean
  readonly defaultThinkingLevel?: CohubThinkingLevel
  readonly thinkingLevelMap?: Readonly<Partial<Record<CohubThinkingLevel, string | null>>>
}

export type CohubContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | {
    type: 'image'
    source:
      | { type: 'url'; url: string }
      | { type: 'base64'; media_type: string; data: string }
  }

export interface CohubCompletionMessage {
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: CohubContentBlock[]
}

export interface CohubCompletionRequest {
  readonly provider: string
  readonly model: string
  readonly messages: CohubCompletionMessage[]
  readonly stream: true
  readonly temperature?: number
  readonly maxTokens?: number
  readonly thinkingLevel?: CohubThinkingLevel
}

export type CohubStreamEvent =
  | {
    type: 'meta'
    completionId: string
    provider: string
    model: string
    systemPromptPath: null
  }
  | { type: 'delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'usage'; usage: CohubUsage }
  | {
    type: 'done'
    completionId: string
    message: CohubAssistantMessage
    usage: CohubUsage | null
  }
  | { type: 'error'; code: string; message: string; completionId?: string | null }

export interface CohubUsage {
  readonly input?: number
  readonly output?: number
  readonly cacheRead?: number
  readonly cacheWrite?: number
  readonly totalTokens?: number
  readonly cost?: unknown
}

export interface CohubAssistantMessage {
  readonly role: 'assistant'
  readonly content: readonly (
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string; signature?: string }
  )[]
  readonly stopReason: 'stop' | 'length' | 'error' | 'aborted'
  readonly errorMessage?: string | null
}

function malformed(message: string): never {
  throw new LlmError(`Cohub returned malformed data: ${message}`, 'MALFORMED_RESPONSE')
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) malformed(`${field} must be an object`)
  return value as Record<string, unknown>
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) malformed(`${field} must be a non-blank string`)
  return value
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) malformed(`${field} must be a positive safe integer`)
  return value as number
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) malformed(`${field} must be a non-negative safe integer`)
  return value as number
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return nonBlank(value, field)
}

function parseThinkingLevel(value: unknown, field: string): CohubThinkingLevel | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !THINKING_LEVEL_SET.has(value)) malformed(`${field} is unsupported`)
  return value as CohubThinkingLevel
}

function parseThinkingLevelMap(value: unknown, field: string): CohubCatalogModel['thinkingLevelMap'] {
  if (value === undefined) return undefined
  const source = record(value, field)
  const result: Partial<Record<CohubThinkingLevel, string | null>> = {}
  for (const [key, mapped] of Object.entries(source)) {
    if (!THINKING_LEVEL_SET.has(key)) continue
    if (mapped !== null && (typeof mapped !== 'string' || mapped.trim().length === 0)) {
      malformed(`${field}.${key} must be null or a non-blank string`)
    }
    result[key as CohubThinkingLevel] = mapped
  }
  return Object.freeze(result)
}

function parseInput(value: unknown, field: string): readonly ('text' | 'image')[] {
  if (value === undefined) return Object.freeze(['text'])
  if (!Array.isArray(value) || value.length === 0) malformed(`${field} must be a non-empty array`)
  const input: ('text' | 'image')[] = value.map((item: unknown, index): 'text' | 'image' => {
    if (item !== 'text' && item !== 'image') malformed(`${field}[${String(index)}] is unsupported`)
    return item
  })
  if (new Set(input).size !== input.length) malformed(`${field} contains duplicates`)
  return Object.freeze(input)
}

/** Encode the Cohub provider/model pair into one unambiguous DSH model id. */
export function cohubModelId(provider: string, model: string): string {
  if (provider.trim().length === 0 || model.trim().length === 0) {
    throw new TypeError('llm-cohub: provider and model must be non-blank strings')
  }
  return JSON.stringify([provider, model])
}

/** Decode a model id advertised by this adapter. */
export function parseCohubModelId(value: string): { provider: string; model: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new LlmError('Cohub model id is not an advertised provider/model pair', 'INVALID_MODEL_ID', { cause: error })
  }
  if (!Array.isArray(parsed) || parsed.length !== 2
    || typeof parsed[0] !== 'string' || parsed[0].trim().length === 0
    || typeof parsed[1] !== 'string' || parsed[1].trim().length === 0) {
    throw new LlmError('Cohub model id is not an advertised provider/model pair', 'INVALID_MODEL_ID')
  }
  return { provider: parsed[0], model: parsed[1] }
}

/** Validate the authenticated `/api/models` response without accepting partial bad state. */
export function parseCatalog(value: unknown): readonly CohubCatalogModel[] {
  const grouped = record(value, 'models response')
  const result: CohubCatalogModel[] = []
  const ids = new Set<string>()
  for (const [groupProvider, rawEntries] of Object.entries(grouped)) {
    nonBlank(groupProvider, 'models provider key')
    if (!Array.isArray(rawEntries)) malformed(`models provider ${groupProvider} must be an array`)
    rawEntries.forEach((rawEntry, index) => {
      const entry = record(rawEntry, `${groupProvider}[${String(index)}]`)
      const provider = nonBlank(entry.provider, `${groupProvider}[${String(index)}].provider`)
      if (provider !== groupProvider) malformed(`${groupProvider}[${String(index)}].provider does not match its group`)
      const id = nonBlank(entry.id, `${groupProvider}[${String(index)}].id`)
      const model = record(entry.model, `${groupProvider}[${String(index)}].model`)
      if (model.hidden === true) return
      const name = optionalString(model.name, `${groupProvider}/${id}.name`) ?? id
      const description = optionalString(model.description, `${groupProvider}/${id}.description`)
      const contextWindow = model.contextWindow === undefined
        ? undefined
        : positiveInteger(model.contextWindow, `${groupProvider}/${id}.contextWindow`)
      const maxTokens = model.maxTokens === undefined
        ? undefined
        : positiveInteger(model.maxTokens, `${groupProvider}/${id}.maxTokens`)
      if (model.reasoning !== undefined && typeof model.reasoning !== 'boolean') {
        malformed(`${groupProvider}/${id}.reasoning must be boolean`)
      }
      const defaultThinkingLevel = parseThinkingLevel(
        model.defaultThinkingLevel,
        `${groupProvider}/${id}.defaultThinkingLevel`,
      )
      const thinkingLevelMap = parseThinkingLevelMap(
        model.thinkingLevelMap,
        `${groupProvider}/${id}.thinkingLevelMap`,
      )
      const encoded = cohubModelId(provider, id)
      if (ids.has(encoded)) malformed(`duplicate model ${provider}/${id}`)
      ids.add(encoded)
      result.push(Object.freeze({
        provider,
        id,
        name,
        ...description === undefined ? {} : { description },
        input: parseInput(model.input, `${groupProvider}/${id}.input`),
        ...contextWindow === undefined ? {} : { contextWindow },
        ...maxTokens === undefined ? {} : { maxTokens },
        reasoning: model.reasoning === true,
        ...defaultThinkingLevel === undefined ? {} : { defaultThinkingLevel },
        ...thinkingLevelMap === undefined ? {} : { thinkingLevelMap },
      }))
    })
  }
  return Object.freeze(result)
}

function supportedModalities(model: CohubCatalogModel, imagesAvailable: boolean): readonly ModelModality[] {
  const result: ModelModality[] = []
  for (const item of model.input) {
    if (item === 'text') result.push('text')
    else if (imagesAvailable) result.push('image')
  }
  return Object.freeze(result)
}

export function toModelInfo(model: CohubCatalogModel, imagesAvailable: boolean): LlmModelInfo {
  return Object.freeze({
    provider: COHUB_PROVIDER_ROUTE,
    id: cohubModelId(model.provider, model.id),
    name: model.name,
    description: model.description ?? `Cohub · ${model.provider}`,
    inputModalities: supportedModalities(model, imagesAvailable),
  })
}

function reasoningInfo(model: CohubCatalogModel): LlmResolvedModelInfo['reasoning'] | undefined {
  if (!model.reasoning) return undefined
  const levels = THINKING_LEVELS.filter((level) => {
    if (level !== 'xhigh' && level !== 'max') return true
    return Object.prototype.hasOwnProperty.call(model.thinkingLevelMap ?? {}, level)
  })
  return Object.freeze({
    efforts: Object.freeze(levels.map(level => Object.freeze({ id: ReasoningEffortId(level), name: level }))),
    ...model.defaultThinkingLevel === undefined
      ? {}
      : { defaultEffort: ReasoningEffortId(model.defaultThinkingLevel) },
  })
}

export function toResolvedModelInfo(model: CohubCatalogModel, imagesAvailable: boolean): LlmResolvedModelInfo {
  const reasoning = reasoningInfo(model)
  return Object.freeze({
    ...toModelInfo(model, imagesAvailable),
    ...model.contextWindow === undefined ? {} : { context: { contextWindow: model.contextWindow } },
    ...model.maxTokens === undefined ? {} : { defaultMaxTokens: model.maxTokens },
    ...reasoning === undefined ? {} : { reasoning },
  })
}

export function parseUsage(value: unknown): TokenUsage {
  const usage = record(value, 'usage')
  const input = usage.input === undefined ? 0 : nonNegativeInteger(usage.input, 'usage.input')
  const output = usage.output === undefined ? 0 : nonNegativeInteger(usage.output, 'usage.output')
  const cacheRead = usage.cacheRead === undefined ? undefined : nonNegativeInteger(usage.cacheRead, 'usage.cacheRead')
  const cacheWrite = usage.cacheWrite === undefined ? undefined : nonNegativeInteger(usage.cacheWrite, 'usage.cacheWrite')
  if (usage.totalTokens !== undefined) nonNegativeInteger(usage.totalTokens, 'usage.totalTokens')
  return Object.freeze({
    inputTokens: input,
    outputTokens: output,
    ...cacheRead === undefined ? {} : { cacheReadTokens: cacheRead },
    ...cacheWrite === undefined ? {} : { cacheWriteTokens: cacheWrite },
  })
}

export function parseAssistantMessage(value: unknown): CohubAssistantMessage {
  const message = record(value, 'done.message')
  if (message.role !== 'assistant') malformed('done.message.role must be assistant')
  if (!Array.isArray(message.content)) malformed('done.message.content must be an array')
  const content = message.content.map((raw, index) => {
    const block = record(raw, `done.message.content[${String(index)}]`)
    if (block.type === 'text') {
      if (typeof block.text !== 'string') malformed(`done.message.content[${String(index)}].text must be a string`)
      return Object.freeze({ type: 'text' as const, text: block.text })
    }
    if (block.type === 'thinking') {
      if (typeof block.thinking !== 'string') malformed(`done.message.content[${String(index)}].thinking must be a string`)
      if (block.signature !== undefined && typeof block.signature !== 'string') {
        malformed(`done.message.content[${String(index)}].signature must be a string`)
      }
      return Object.freeze({
        type: 'thinking' as const,
        thinking: block.thinking,
        ...block.signature === undefined ? {} : { signature: block.signature },
      })
    }
    return malformed(`done.message.content[${String(index)}].type is unsupported`)
  })
  if (message.stopReason !== 'stop' && message.stopReason !== 'length'
    && message.stopReason !== 'error' && message.stopReason !== 'aborted') {
    malformed('done.message.stopReason is unsupported')
  }
  if (message.errorMessage !== undefined && message.errorMessage !== null && typeof message.errorMessage !== 'string') {
    malformed('done.message.errorMessage must be a string or null')
  }
  return Object.freeze({
    role: 'assistant' as const,
    content: Object.freeze(content),
    stopReason: message.stopReason,
    ...message.errorMessage === undefined ? {} : { errorMessage: message.errorMessage },
  })
}

export function finishReason(message: CohubAssistantMessage): FinishReason {
  if (message.stopReason === 'stop') return { kind: 'stop' }
  if (message.stopReason === 'length') return { kind: 'max-tokens' }
  const failure = {
    message: message.errorMessage?.trim() || (message.stopReason === 'aborted' ? 'Cohub completion aborted' : 'Cohub completion failed'),
    code: message.stopReason === 'aborted' ? 'ABORTED' : 'COHUB_COMPLETION_ERROR',
  }
  return message.stopReason === 'aborted' ? { kind: 'aborted', failure } : { kind: 'error', failure }
}

export function parseStreamEvent(value: unknown): CohubStreamEvent {
  const event = record(value, 'stream event')
  switch (event.type) {
    case 'meta':
      return {
        type: 'meta',
        completionId: nonBlank(event.completionId, 'meta.completionId'),
        provider: nonBlank(event.provider, 'meta.provider'),
        model: nonBlank(event.model, 'meta.model'),
        systemPromptPath: event.systemPromptPath === null ? null : malformed('meta.systemPromptPath must be null'),
      }
    case 'delta':
    case 'thinking_delta':
      if (typeof event.text !== 'string') malformed(`${event.type}.text must be a string`)
      return { type: event.type, text: event.text }
    case 'usage':
      parseUsage(event.usage)
      return { type: 'usage', usage: event.usage as CohubUsage }
    case 'done':
      if (event.usage !== null) parseUsage(event.usage)
      return {
        type: 'done',
        completionId: nonBlank(event.completionId, 'done.completionId'),
        message: parseAssistantMessage(event.message),
        usage: event.usage as CohubUsage | null,
      }
    case 'error':
      return {
        type: 'error',
        code: nonBlank(event.code, 'error.code'),
        message: nonBlank(event.message, 'error.message'),
        ...event.completionId === undefined || event.completionId === null
          ? {}
          : { completionId: nonBlank(event.completionId, 'error.completionId') },
      }
    default:
      return malformed('stream event type is unsupported')
  }
}
