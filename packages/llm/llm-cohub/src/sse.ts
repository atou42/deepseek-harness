/** Cohub completion SSE framing and StreamChunk translation. */

import { EventSourceParserStream } from 'eventsource-parser/stream'
import { EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import {
  finishReason,
  parseAssistantMessage,
  parseStreamEvent,
  parseUsage,
} from './protocol.ts'

/**
 * Decode Cohub SSE data frames into JSON values.
 * @param stream - HTTP response body.
 * @param onComment - Optional activity callback for SSE comments.
 * @returns Decoded event values.
 */
export async function* parseCohubSse(
  stream: ReadableStream<BufferSource>,
  onComment?: (comment: string) => void,
): AsyncGenerator {
  const events = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onComment }))
  for await (const event of events) {
    try {
      yield JSON.parse(event.data) as unknown
    } catch (error) {
      throw new LlmError(`Cohub returned malformed SSE JSON: ${event.data.slice(0, 120)}`, 'MALFORMED_RESPONSE', { cause: error })
    }
  }
}

interface OpenBlock {
  readonly index: number
  readonly type: 'text' | 'reasoning'
  text: string
}

function usageEqual(left: TokenUsage, right: TokenUsage): boolean {
  return left.inputTokens === right.inputTokens
    && left.outputTokens === right.outputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheWriteTokens === right.cacheWriteTokens
    && left.reasoningTokens === right.reasoningTokens
}

function apiEventError(code: string, message: string): LlmError {
  const normalized = code.toLowerCase()
  if (normalized.includes('auth') || normalized.includes('unauthorized') || normalized.includes('forbidden')) {
    return new LlmError(message, 'AUTH')
  }
  if (normalized.includes('balance') || normalized.includes('billing') || normalized.includes('quota') || normalized.includes('credit')) {
    return new LlmError(message, 'QUOTA')
  }
  return new LlmError(message, `COHUB_${code.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`)
}

/**
 * Translate Cohub events, requiring a self-consistent terminal `done` event.
 * @param values - Decoded Cohub event values.
 * @param expected - Provider/model identity sent in the request.
 * @returns DSH stream chunks.
 */
export async function* translateCohubEvents(
  values: AsyncIterable<unknown>,
  expected: { provider: string; model: string },
): AsyncGenerator<StreamChunk> {
  let meta: { completionId: string } | undefined
  let nextIndex = 0
  const order: OpenBlock[] = []
  let text: OpenBlock | undefined
  let reasoning: OpenBlock | undefined
  let pendingUsage: TokenUsage | undefined

  const open = (type: OpenBlock['type']): OpenBlock => {
    const value = { index: nextIndex++, type, text: '' }
    order.push(value)
    return value
  }

  for await (const value of values) {
    const event = parseStreamEvent(value)
    if (event.type === 'meta') {
      if (meta !== undefined) throw new LlmError('Cohub stream repeated its meta event', 'MALFORMED_RESPONSE')
      if (event.provider !== expected.provider || event.model !== expected.model) {
        throw new LlmError('Cohub stream model identity does not match the request', 'MALFORMED_RESPONSE')
      }
      meta = { completionId: event.completionId }
      continue
    }
    if (event.type === 'delta') {
      if (meta === undefined) throw new LlmError('Cohub stream emitted text before meta', 'MALFORMED_RESPONSE')
      if (event.text.length === 0) continue
      if (text === undefined) {
        text = open('text')
        yield { type: 'block-start', index: text.index, blockType: 'text' }
      }
      text.text += event.text
      yield { type: 'text-delta', index: text.index, text: event.text }
      continue
    }
    if (event.type === 'thinking_delta') {
      if (meta === undefined) throw new LlmError('Cohub stream emitted reasoning before meta', 'MALFORMED_RESPONSE')
      if (event.text.length === 0) continue
      if (reasoning === undefined) {
        reasoning = open('reasoning')
        yield { type: 'block-start', index: reasoning.index, blockType: 'reasoning' }
      }
      reasoning.text += event.text
      yield { type: 'reasoning-delta', index: reasoning.index, text: event.text }
      continue
    }
    if (event.type === 'usage') {
      if (meta === undefined) throw new LlmError('Cohub stream emitted usage before meta', 'MALFORMED_RESPONSE')
      pendingUsage = parseUsage(event.usage)
      continue
    }
    if (event.type === 'error') throw apiEventError(event.code, event.message)

    if (meta === undefined) throw new LlmError('Cohub stream ended without meta', 'MALFORMED_RESPONSE')
    if (event.completionId !== meta.completionId) {
      throw new LlmError('Cohub done completion id does not match meta', 'MALFORMED_RESPONSE')
    }
    const message = parseAssistantMessage(event.message)
    const finalText = message.content.filter(item => item.type === 'text').map(item => item.text).join('')
    const finalReasoning = message.content.filter(item => item.type === 'thinking').map(item => item.thinking).join('')
    if (text !== undefined && text.text !== finalText) {
      throw new LlmError('Cohub final text does not match streamed text', 'MALFORMED_RESPONSE')
    }
    if (reasoning !== undefined && reasoning.text !== finalReasoning) {
      throw new LlmError('Cohub final reasoning does not match streamed reasoning', 'MALFORMED_RESPONSE')
    }

    for (const item of message.content) {
      if (item.type === 'text' && text === undefined && item.text.length > 0) {
        text = open('text')
        text.text = finalText
        yield { type: 'block-start', index: text.index, blockType: 'text' }
        yield { type: 'text-delta', index: text.index, text: finalText }
      }
      if (item.type === 'thinking' && reasoning === undefined && item.thinking.length > 0) {
        reasoning = open('reasoning')
        reasoning.text = finalReasoning
        yield { type: 'block-start', index: reasoning.index, blockType: 'reasoning' }
        yield { type: 'reasoning-delta', index: reasoning.index, text: finalReasoning }
      }
    }

    for (const item of order) {
      const block: ContentBlock = item.type === 'text'
        ? { type: 'text', text: item.text }
        : { type: 'reasoning', text: item.text }
      yield { type: 'block-end', index: item.index, block }
    }
    const doneUsage = event.usage === null ? undefined : parseUsage(event.usage)
    if (doneUsage !== undefined && pendingUsage !== undefined && !usageEqual(doneUsage, pendingUsage)) {
      throw new LlmError('Cohub done usage does not match streamed usage', 'MALFORMED_RESPONSE')
    }
    const usage = doneUsage ?? pendingUsage
    if (usage !== undefined) yield { type: 'usage', usage }
    const reason = finishReason(message)
    yield {
      type: 'finish',
      reason: reason.kind === 'stop' && order.length === 0
        ? {
          kind: 'error',
          failure: { message: 'Cohub model returned no content', code: EMPTY_RESPONSE_CODE },
        }
        : reason,
    }
    return
  }
  throw new LlmError('Cohub completion stream ended without a done event', 'STREAM_CLOSED')
}
