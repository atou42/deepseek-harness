import { describe, expect, it, vi } from 'vitest'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { CohubAdapter } from '../src/adapter.ts'
import {
  cohubModelId,
  parseCatalog,
  parseCohubModelId,
  toResolvedModelInfo,
} from '../src/protocol.ts'
import { serializeCohubRequest } from '../src/serialize.ts'
import { translateCohubEvents } from '../src/sse.ts'

const connection = {
  apiBaseUrl: 'https://api.cohub.test',
  spaceId: 'space-1',
  streamIdleTimeoutMs: 5_000,
}

function options(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'cohub',
    model: cohubModelId('openai', 'gpt-test'),
    messages: [{
      id: 'message-1' as never,
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'hello' }],
    }],
    ...overrides,
  }
}

function sse(events: unknown[]): Response {
  const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

async function chunks(source: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const result: StreamChunk[] = []
  for await (const chunk of source) result.push(chunk)
  return result
}

function adapter(fetch: typeof globalThis.fetch, token = vi.fn().mockResolvedValue('secret-token')) {
  return {
    token,
    value: new CohubAdapter({
      connection: () => connection,
      resolveAccessToken: token,
      resolveAttachments: () => undefined,
      fetch,
    }),
  }
}

const catalog = {
  openai: [{
    provider: 'openai',
    id: 'gpt-test',
    model: {
      name: 'GPT Test',
      description: 'test model',
      input: ['text', 'image'],
      reasoning: true,
      defaultThinkingLevel: 'medium',
      thinkingLevelMap: { xhigh: 'xhigh' },
      contextWindow: 200000,
      maxTokens: 16000,
    },
  }, {
    provider: 'openai',
    id: 'hidden',
    model: { hidden: true },
  }],
}

describe('Cohub model identity and catalog', () => {
  it('round-trips provider/model identity and refuses ambiguous ids', () => {
    const id = cohubModelId('provider/with/slash', 'model/with/slash')
    expect(parseCohubModelId(id)).toEqual({ provider: 'provider/with/slash', model: 'model/with/slash' })
    expect(() => parseCohubModelId('provider/model')).toThrow(/advertised provider\/model pair/)
  })

  it('validates the full catalog, hides hidden entries, and projects exact metadata', () => {
    const parsed = parseCatalog(catalog)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ provider: 'openai', id: 'gpt-test', name: 'GPT Test' })
    expect(toResolvedModelInfo(parsed[0]!, true)).toEqual({
      provider: 'cohub',
      id: cohubModelId('openai', 'gpt-test'),
      name: 'GPT Test',
      description: 'test model',
      inputModalities: ['text', 'image'],
      context: { contextWindow: 200000 },
      defaultMaxTokens: 16000,
      reasoning: {
        efforts: [
          { id: 'off', name: 'off' },
          { id: 'minimal', name: 'minimal' },
          { id: 'low', name: 'low' },
          { id: 'medium', name: 'medium' },
          { id: 'high', name: 'high' },
          { id: 'xhigh', name: 'xhigh' },
        ],
        defaultEffort: 'medium',
      },
    })
    expect(toResolvedModelInfo(parsed[0]!, false).inputModalities).toEqual(['text'])
  })

  it('rejects a malformed grouped response instead of publishing a partial catalog', () => {
    expect(() => parseCatalog({ openai: [{ provider: 'other', id: 'x', model: {} }] }))
      .toThrow(/does not match its group/)
    expect(() => parseCatalog({ openai: [{ provider: 'openai', id: 'x', model: { input: ['audio'] } }] }))
      .toThrow(/unsupported/)
  })
})

describe('Cohub request serialization', () => {
  it('maps system, text, image, call config, and namespaced model identity', async () => {
    const ref = {
      attachmentId: 'attachment-1',
      mediaType: 'image/png',
      bytes: 3,
      width: 1,
      height: 1,
    } as ImageAttachmentRef
    const readImage = vi.fn().mockResolvedValue({ ref, data: Uint8Array.from([1, 2, 3]) })
    const attachments = {
      readImage,
    } as unknown as AttachmentStore
    const request = await serializeCohubRequest(options({
      system: 'system',
      reasoningEffort: 'high' as never,
      temperature: 0.2,
      maxTokens: 123,
      messages: [{
        id: 'message-image' as never,
        role: 'user',
        source: { kind: 'user' },
        content: [
          { type: 'text', text: 'look' },
          { type: 'image', attachment: ref },
        ],
      }],
    }), attachments)
    expect(request).toEqual({
      provider: 'openai',
      model: 'gpt-test',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'system' }] },
        { role: 'user', content: [
          { type: 'text', text: 'look' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } },
        ] },
      ],
      stream: true,
      temperature: 0.2,
      maxTokens: 123,
      thinkingLevel: 'high',
    })
    expect(readImage).toHaveBeenCalledWith(ref, undefined)
  })

  it('fails before transport when the Cohub endpoint cannot preserve tool or stop semantics', async () => {
    await expect(serializeCohubRequest(options({
      tools: [{ name: 'bash', description: 'run', parameters: { type: 'object' } }],
    }))).rejects.toMatchObject({ code: 'UNSUPPORTED_TOOLS' })
    await expect(serializeCohubRequest(options({ stop: ['END'] })))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_STOP' })
    await expect(serializeCohubRequest(options({
      messages: [{
        id: 'assistant-tool' as never,
        role: 'assistant',
        source: { kind: 'model', provider: 'other', model: 'other' },
        content: [{ type: 'tool-call', id: 'call-1' as never, name: 'bash', arguments: '{}' }],
      }],
    }))).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
  })
})

describe('Cohub stream translation', () => {
  it('emits canonical reasoning/text blocks, disjoint usage, then one finish', async () => {
    const output = await chunks(translateCohubEvents((async function* () {
      yield { type: 'meta', completionId: 'completion-1', provider: 'openai', model: 'gpt-test', systemPromptPath: null }
      yield { type: 'thinking_delta', text: 'think' }
      yield { type: 'delta', text: 'hello' }
      yield { type: 'usage', usage: { input: 10, output: 4, cacheRead: 2, totalTokens: 16 } }
      yield {
        type: 'done',
        completionId: 'completion-1',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'think' }, { type: 'text', text: 'hello' }],
          stopReason: 'stop',
        },
        usage: { input: 10, output: 4, cacheRead: 2, totalTokens: 16 },
      }
    })(), { provider: 'openai', model: 'gpt-test' }))
    expect(output).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'think' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'hello' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'think' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'hello' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('rejects truncated and internally inconsistent streams', async () => {
    await expect(chunks(translateCohubEvents((async function* () {
      yield { type: 'meta', completionId: 'completion-1', provider: 'openai', model: 'gpt-test', systemPromptPath: null }
      yield { type: 'delta', text: 'partial' }
    })(), { provider: 'openai', model: 'gpt-test' }))).rejects.toMatchObject({ code: 'STREAM_CLOSED' })
    await expect(chunks(translateCohubEvents((async function* () {
      yield { type: 'meta', completionId: 'completion-1', provider: 'openai', model: 'gpt-test', systemPromptPath: null }
      yield { type: 'delta', text: 'a' }
      yield {
        type: 'done', completionId: 'completion-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'b' }], stopReason: 'stop' },
        usage: null,
      }
    })(), { provider: 'openai', model: 'gpt-test' }))).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })
})

describe('Cohub adapter transport and lifecycle', () => {
  it('lists authenticated models without exposing the token and streams through the Space endpoint', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      requests.push({ url, init })
      if (url.endsWith('/api/models')) {
        return new Response(JSON.stringify(catalog), { headers: { 'content-type': 'application/json' } })
      }
      return sse([
        { type: 'meta', completionId: 'completion-1', provider: 'openai', model: 'gpt-test', systemPromptPath: null },
        { type: 'delta', text: 'answer' },
        {
          type: 'done', completionId: 'completion-1',
          message: { role: 'assistant', content: [{ type: 'text', text: 'answer' }], stopReason: 'stop' },
          usage: { input: 2, output: 1, totalTokens: 3 },
        },
      ])
    })
    const subject = adapter(fetch)
    const models = await subject.value.listModels('cohub')
    expect(models).toEqual([{
      provider: 'cohub',
      id: cohubModelId('openai', 'gpt-test'),
      name: 'GPT Test',
      description: 'test model',
      inputModalities: ['text'],
    }])
    const output = await chunks(subject.value.stream(options()))
    expect(output.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(requests.map(item => item.url)).toEqual([
      'https://api.cohub.test/api/models',
      'https://api.cohub.test/api/spaces/space-1/completions',
    ])
    expect(new Headers(requests[0]!.init?.headers).get('authorization')).toBe('Bearer secret-token')
    const requestBody = requests[1]!.init?.body
    if (typeof requestBody !== 'string') throw new TypeError('test expected a string request body')
    const sent = JSON.parse(requestBody) as unknown
    expect(sent).toMatchObject({ provider: 'openai', model: 'gpt-test', stream: true })
    expect(JSON.stringify(models)).not.toContain('secret-token')
    expect(JSON.stringify(sent)).not.toContain('secret-token')
  })

  it('maps account and HTTP failures, and does not retry billable requests', async () => {
    const noFetch = vi.fn<typeof globalThis.fetch>()
    const auth = adapter(noFetch, vi.fn().mockRejectedValue(new Error('anonymous')))
    await expect(chunks(auth.value.stream(options()))).rejects.toMatchObject({ code: 'AUTH' })
    expect(noFetch).not.toHaveBeenCalled()

    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'insufficient_credits', message: 'No credits' } }),
      { status: 402, headers: { 'content-type': 'application/json' } },
    ))
    const billed = adapter(fetch)
    await expect(chunks(billed.value.stream(options()))).rejects.toMatchObject({
      code: 'QUOTA',
      failure: { status: 402 },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(billed.value.providerRetryPolicy('cohub')).toMatchObject({ mode: 'normal', maxRetries: 0 })
  })

  it('aborts an active fetch when the adapter unloads', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'))
      }, { once: true })
    }))
    const subject = adapter(fetch)
    const active = chunks(subject.value.stream(options()))
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    subject.value.close()
    await expect(active).rejects.toMatchObject({ code: 'ABORTED' })
  })
})
