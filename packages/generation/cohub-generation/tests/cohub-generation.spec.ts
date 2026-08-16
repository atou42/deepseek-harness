import { describe, expect, it, vi } from 'vitest'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { CohubAccountService } from '@deepseek-ai/dsh-cohub-account'
import {
  CohubGenerationClient,
  parseGenerationCatalog,
} from '../src/index.ts'

const SPACE_ID = 'space-generation-test'
const TASK_ID = 'task-generation-test'
const TOKEN = 'private-generation-token'

function declaration(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'neta.generation.model.v1',
    model: 'gpt-image-2',
    title: 'GPT Image 2',
    description: 'Image generation',
    content: { input: [{ type: 'text' }, { type: 'image' }] },
    parameters: { quality: { type: 'string', enum: ['low', 'high'] } },
    ...overrides,
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestUrl(value: string | URL | Request): string {
  if (typeof value === 'string') return value
  if (value instanceof URL) return value.href
  return value.url
}

function requestBody(value: BodyInit | null | undefined): string {
  if (typeof value !== 'string') throw new TypeError('expected a string request body')
  return value
}

function account(): CohubAccountService {
  return { getAccessToken: vi.fn(async () => TOKEN) } as unknown as CohubAccountService
}

function client(
  fetch: typeof globalThis.fetch,
  attachments: () => AttachmentStore | undefined = () => undefined,
) {
  return new CohubGenerationClient({
    account: account(),
    attachments,
    config: {
      spaceId: SPACE_ID,
      apiBaseUrl: 'https://api.example.test',
      pollIntervalMs: 1,
      timeoutMs: 50,
    },
    fetch,
  })
}

function task(status: string, result?: unknown, errorMessage?: string) {
  return {
    run: {
      id: TASK_ID,
      taskType: 'generation',
      status,
      result: result ?? null,
      errorMessage: errorMessage ?? null,
    },
    progress: status === 'running' ? { percent: 25 } : null,
  }
}

describe('Cohub generation catalog boundary', () => {
  it('publishes validated model declarations while preserving dynamic specs as JSON', () => {
    const [model] = parseGenerationCatalog([declaration({ hidden: true, meta: { fields: { title: { type: 'string' } } } })])
    expect(model).toEqual({
      model: 'gpt-image-2',
      title: 'GPT Image 2',
      description: 'Image generation',
      hidden: true,
      inputTypes: ['text', 'image'],
      parametersJson: JSON.stringify({ quality: { type: 'string', enum: ['low', 'high'] } }),
      metaJson: JSON.stringify({ fields: { title: { type: 'string' } } }),
    })
    expect(() => parseGenerationCatalog([declaration(), declaration()])).toThrow(/duplicate model/)
    expect(() => parseGenerationCatalog([declaration({ content: { input: [{ type: 'document' }] } })])).toThrow(/type is invalid/)
  })

  it('filters hidden discovery entries without hiding exact server capability data', async () => {
    const request = vi.fn(async () => json([declaration(), declaration({ model: 'hidden-model', title: 'Hidden', hidden: true })]))
    const generation = client(request)
    await expect(generation.listModels()).resolves.toHaveLength(1)
    await expect(generation.listModels(true)).resolves.toHaveLength(2)
    expect(request).toHaveBeenCalledTimes(2)
    await generation.close()
  })
})

describe('Cohub generation task lifecycle', () => {
  it('creates one Space-scoped task, polls it, and returns validated media and billing', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const responses = [
      json({ taskRunId: TASK_ID, taskType: 'generation', status: 'pending' }, 202),
      json(task('running')),
      json(task('completed', {
        model: 'seedance-2-0',
        output: [
          { type: 'text', text: 'ready' },
          { type: 'video', source: { type: 'url', url: 'https://cdn.example.test/video.mp4' } },
          { type: 'image', source: { type: 'url', url: 'https://cdn.example.test/frame.png' }, meta: { role: 'last_frame' } },
        ],
        requestId: 'provider-request',
        cost: 0.72,
        billing: {
          officialCostUsd: 0.72,
          amountUsd: 0.432,
          discountMultiplier: 0.6,
          usageType: 'generation.video',
          status: 'recorded',
          reason: null,
        },
      })),
    ]
    const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: requestUrl(url), ...init === undefined ? {} : { init } })
      const response = responses.shift()
      if (response === undefined) throw new Error('unexpected request')
      return response
    })
    const generation = client(request)
    const result = await generation.generate({
      model: 'seedance-2-0',
      prompt: 'animate this character',
      references: [{ type: 'image', url: 'https://cdn.example.test/reference.png', role: 'first_frame' }],
      parameters: { duration: 5, generate_audio: true },
    })
    expect(result).toMatchObject({
      taskRunId: TASK_ID,
      status: 'completed',
      model: 'seedance-2-0',
      requestId: 'provider-request',
      cost: 0.72,
      billing: { amountUsd: 0.432, discountMultiplier: 0.6 },
      output: [
        { type: 'text', text: 'ready' },
        { type: 'video', url: 'https://cdn.example.test/video.mp4' },
        { type: 'image', url: 'https://cdn.example.test/frame.png', role: 'last_frame' },
      ],
    })
    expect(calls.map(call => call.url)).toEqual([
      'https://api.example.test/api/generations',
      `https://api.example.test/api/tasks/${TASK_ID}`,
      `https://api.example.test/api/tasks/${TASK_ID}`,
    ])
    const created = calls[0]
    expect(new Headers(created?.init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(requestBody(created?.init?.body))).toEqual({
      spaceId: SPACE_ID,
      model: 'seedance-2-0',
      content: [
        { type: 'text', text: 'animate this character' },
        { type: 'image', source: { type: 'url', url: 'https://cdn.example.test/reference.png' }, meta: { role: 'first_frame' } },
      ],
      parameters: { duration: 5, generate_audio: true },
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    await generation.close()
  })

  it('persists inline image bytes through the only mounted attachment store', async () => {
    const saved: Array<{ mediaType: string; bytes: number }> = []
    const ref: ImageAttachmentRef = {
      attachmentId: 'sha256:image' as ImageAttachmentRef['attachmentId'],
      mediaType: 'image/png',
      bytes: 3,
      width: 1,
      height: 1,
    }
    const store = {
      imageLimits: {
        maxImageBytes: 1_000,
        maxImagesPerMessage: 4,
        maxMessageImageBytes: 2_000,
        maxImagePixels: 100,
        mediaTypes: ['image/png'],
      },
      async saveImage(input: { data: Uint8Array; mediaType: string }) {
        saved.push({ mediaType: input.mediaType, bytes: input.data.byteLength })
        return ref
      },
    } as unknown as AttachmentStore
    const responses = [
      json({ taskRunId: TASK_ID, taskType: 'generation', status: 'pending' }, 202),
      json(task('completed', {
        model: 'gpt-image-2',
        output: [{ type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'AQID' } }],
      })),
    ]
    const generation = client(vi.fn(async () => responses.shift() as Response), () => store)
    const result = await generation.generate({ model: 'gpt-image-2', prompt: 'tiny image' })
    expect(saved).toEqual([{ mediaType: 'image/png', bytes: 3 }])
    expect(result.output).toEqual([{ type: 'image', attachment: {
      attachmentId: 'sha256:image',
      mediaType: 'image/png',
      bytes: 3,
      width: 1,
      height: 1,
    } }])
    await generation.close()
  })

  it('keeps a completed image URL and exposes attachment download failure', async () => {
    const store = {
      imageLimits: {
        maxImageBytes: 1_000,
        maxImagesPerMessage: 4,
        maxMessageImageBytes: 2_000,
        maxImagePixels: 100,
        mediaTypes: ['image/png'],
      },
      saveImage: vi.fn(),
    } as unknown as AttachmentStore
    const responses = [
      json({ taskRunId: TASK_ID, taskType: 'generation', status: 'pending' }, 202),
      json(task('completed', {
        model: 'gpt-image-2',
        output: [{ type: 'image', source: { type: 'url', url: 'https://cdn.example.test/out.png' } }],
      })),
      new Response('gone', { status: 404 }),
    ]
    const generation = client(vi.fn(async () => responses.shift() as Response), () => store)
    const result = await generation.generate({ model: 'gpt-image-2', prompt: 'image' })
    expect(result.output[0]).toEqual({
      type: 'image',
      url: 'https://cdn.example.test/out.png',
      attachmentWarning: 'Generated image remains available at its URL, but DSH could not persist it: image download failed with HTTP 404',
    })
    await generation.close()
  })

  it('never repeats task creation after polling fails and supports status recovery', async () => {
    const request = vi.fn(async (url: string | URL | Request) => {
      if (requestUrl(url).endsWith('/api/generations')) {
        return json({ taskRunId: TASK_ID, taskType: 'generation', status: 'pending' }, 202)
      }
      throw new Error('poll transport failed')
    })
    const generation = client(request)
    await expect(generation.generate({ model: 'gpt-image-2', prompt: 'one charge only' }))
      .rejects.toMatchObject({ taskRunId: TASK_ID })
    expect(request.mock.calls.filter(([url]) => requestUrl(url).endsWith('/api/generations'))).toHaveLength(1)
    await expect(generation.getTask(TASK_ID)).rejects.toThrow('poll transport failed')
    expect(request.mock.calls.filter(([url]) => requestUrl(url).endsWith('/api/generations'))).toHaveLength(1)
    await generation.close()
  })

  it('returns failed tasks explicitly and rejects malformed completed results', async () => {
    const failed = client(vi.fn(async () => json(task('failed', undefined, 'provider rejected prompt'))))
    await expect(failed.getTask(TASK_ID)).resolves.toEqual({
      taskRunId: TASK_ID,
      status: 'failed',
      errorMessage: 'provider rejected prompt',
    })
    await failed.close()

    const malformed = client(vi.fn(async () => json(task('completed', { model: 'x', output: [{ type: 'video' }] }))))
    await expect(malformed.getTask(TASK_ID)).rejects.toThrow(/source must be an object/)
    await malformed.close()
  })

  it('surfaces billing rejection and does not retry the billable create request', async () => {
    const request = vi.fn(async () => json({ code: 'billing_required', message: 'credits required' }, 402))
    const generation = client(request)
    await expect(generation.generate({ model: 'gpt-image-2', prompt: 'image' }))
      .rejects.toEqual(expect.objectContaining({
        status: 402,
        code: 'billing_required',
      }))
    expect(request).toHaveBeenCalledTimes(1)
    await generation.close()
  })

  it('aborts active requests and waits for them when the plugin client closes', async () => {
    let aborted = false
    const request = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      signal?.addEventListener('abort', () => {
        aborted = true
        reject(signal.reason instanceof Error ? signal.reason : new Error('aborted', { cause: signal.reason }))
      }, { once: true })
    }))
    const generation = client(request)
    const pending = generation.listModels()
    await Promise.resolve()
    await generation.close()
    await expect(pending).rejects.toThrow(/disposed/)
    expect(aborted).toBe(true)
  })
})
