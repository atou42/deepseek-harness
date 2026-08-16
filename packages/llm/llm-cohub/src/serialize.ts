/** Translate DSH messages into Cohub raw-completion messages. */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type {
  CohubCompletionMessage,
  CohubCompletionRequest,
  CohubContentBlock,
  CohubThinkingLevel,
} from './protocol.ts'
import { parseCohubModelId } from './protocol.ts'

const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

function unsupported(message: string): never {
  throw new LlmError(message, 'UNSUPPORTED_CONTENT')
}

function thinkingLevel(options: GenerateOptions): CohubThinkingLevel | undefined {
  if (options.purpose === 'session-title') return 'off'
  if (options.reasoningEffort === undefined) return undefined
  const value = String(options.reasoningEffort)
  if (!THINKING_LEVELS.has(value)) {
    throw new LlmError(`Cohub does not support reasoning effort "${value}"`, 'UNSUPPORTED_REASONING_EFFORT')
  }
  return value as CohubThinkingLevel
}

async function block(
  value: ContentBlock,
  role: Message['role'],
  attachments: AttachmentStore | undefined,
  signal: AbortSignal | undefined,
): Promise<CohubContentBlock | undefined> {
  switch (value.type) {
    case 'text':
      return { type: 'text', text: value.text }
    case 'reasoning':
      // Cohub accepts thinking history. Its current completion runtime ignores
      // assistant thinking on replay, matching the no-tool boundary below.
      return { type: 'thinking', thinking: value.text }
    case 'image': {
      if (role !== 'user') unsupported('Cohub raw completion supports image content only in user messages')
      if (attachments === undefined) {
        unsupported('Cohub image conversion requires the durable attachment service')
      }
      const stored = await attachments.readImage(value.attachment, signal)
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: stored.ref.mediaType,
          data: Buffer.from(stored.data).toString('base64'),
        },
      }
    }
    case 'tool-call':
    case 'tool-result':
      unsupported('Cohub raw completion does not support DSH tool-call history')
    default:
      unsupported(`Cohub raw completion cannot serialize content block "${String((value as { type?: unknown }).type)}"`)
  }
}

async function message(
  value: Message,
  attachments: AttachmentStore | undefined,
  signal: AbortSignal | undefined,
): Promise<CohubCompletionMessage> {
  const content: CohubContentBlock[] = []
  for (const item of value.content) {
    const converted = await block(item, value.role, attachments, signal)
    if (converted !== undefined) content.push(converted)
  }
  if (content.length === 0) content.push({ type: 'text', text: '' })
  return { role: value.role, content }
}

/** Serialize one exact DSH call, refusing unsupported semantics before network I/O. */
export async function serializeCohubRequest(
  options: GenerateOptions,
  attachments?: AttachmentStore,
): Promise<CohubCompletionRequest> {
  if (options.tools !== undefined && options.tools.length > 0) {
    throw new LlmError(
      'Cohub raw completion does not expose tool schemas; disable DSH tools for this model route',
      'UNSUPPORTED_TOOLS',
    )
  }
  if (options.stop !== undefined && options.stop.length > 0) {
    throw new LlmError('Cohub raw completion does not expose stop sequences', 'UNSUPPORTED_STOP')
  }
  if (options.temperature !== undefined && !Number.isFinite(options.temperature)) {
    throw new LlmError('Cohub temperature must be finite', 'INVALID_REQUEST')
  }
  if (options.maxTokens !== undefined && (!Number.isSafeInteger(options.maxTokens) || options.maxTokens <= 0)) {
    throw new LlmError('Cohub maxTokens must be a positive safe integer', 'INVALID_REQUEST')
  }

  const selected = parseCohubModelId(options.model)
  const messages: CohubCompletionMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: [{ type: 'text', text: options.system }] })
  }
  for (const value of options.messages) messages.push(await message(value, attachments, options.signal))
  if (messages.length === 0) {
    throw new LlmError('Cohub raw completion requires at least one message or system prompt', 'INVALID_REQUEST')
  }
  const effort = thinkingLevel(options)
  return {
    provider: selected.provider,
    model: selected.model,
    messages,
    stream: true,
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
    ...effort === undefined ? {} : { thinkingLevel: effort },
  }
}
