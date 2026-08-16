import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import CohubSpacesGateway, {
  CohubSpaceFilePreparingError,
  CohubSpacesHttpError,
} from '../src/index.ts'

const contexts: Context[] = []

class TestAccount extends Service {
  private readonly listeners = new Set<() => void>()
  token = 'account-token'
  readonly snapshot = {
    getSnapshot: () => ({ revision: 1, status: 'authenticated' as const }),
    subscribe: (listener: () => void) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  constructor(ctx: Context) {
    super(ctx, 'cohubAccount')
  }

  getAccessToken(): Promise<string> {
    return Promise.resolve(this.token)
  }

  notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function boot() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(TestAccount)
  const fiber = ctx.plugin(CohubSpacesGateway, { apiBaseUrl: 'https://cohub.example.test/' })
  await fiber.await()
  return {
    ctx,
    fiber,
    account: ctx.get('cohubAccount') as unknown as TestAccount,
    spaces: ctx.cohubSpaces,
  }
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('CohubSpacesGateway', () => {
  it('exposes the four Space/files Remote methods', async () => {
    const { spaces } = await boot()
    expect(spaces.typertRemote).toMatchObject({ serviceKey: 'cohubSpaces', namespace: 'cohubSpaces' })
    expect(remoteMethods(spaces)).toEqual([
      { method: 'listSpaces', invocation: { kind: 'direct' } },
      { method: 'listDirectory', invocation: { kind: 'direct' } },
      { method: 'readText', invocation: { kind: 'direct' } },
      { method: 'writeText', invocation: { kind: 'direct' } },
    ])
  })

  it('lists accessible Spaces and preserves file, folder, and symlink kinds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([
        { id: 'space-1', title: 'World Bible', name: null, slug: 'world-bible' },
        { id: 'space-2', title: null, name: 'Drafts', slug: 'drafts' },
      ]))
      .mockResolvedValueOnce(json({
        path: 'wiki',
        entries: [
          { name: 'characters', path: 'wiki/characters', type: 'dir', size: 0, mimeType: null, mtimeMs: 10 },
          { name: 'index.md', path: 'wiki/index.md', type: 'file', size: 12, mimeType: 'text/markdown', mtimeMs: 11 },
          { name: 'latest', path: 'wiki/latest', type: 'symlink', size: 8, mimeType: null, mtimeMs: 12 },
        ],
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()

    await expect(spaces.listSpaces()).resolves.toEqual([
      { id: 'space-1', title: 'World Bible' },
      { id: 'space-2', title: 'Drafts' },
    ])
    await expect(spaces.listDirectory('space/1', 'wiki')).resolves.toEqual({
      spaceId: 'space/1',
      path: 'wiki',
      entries: [
        { path: 'wiki/characters', name: 'characters', kind: 'folder', size: 0, revision: '10:0' },
        { path: 'wiki/index.md', name: 'index.md', kind: 'file', size: 12, revision: '11:12' },
        { path: 'wiki/latest', name: 'latest', kind: 'link', size: 8, revision: '12:8' },
      ],
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cohub.example.test/api/spaces')
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://cohub.example.test/api/spaces/space%2F1/fs/tree?path=wiki',
    )
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get('authorization'))
      .toBe('Bearer account-token')
  })

  it('reads inline text and converts stale writes into explicit conflicts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        path: 'wiki/index.md', name: 'index.md', size: 5, mimeType: 'text/markdown', mtimeMs: 20,
        kind: 'text', encoding: 'utf-8', content: 'hello', delivery: 'inline',
      }))
      .mockResolvedValueOnce(json({ message: 'expected revision does not match' }, 409))
      .mockResolvedValueOnce(json({
        path: 'wiki/index.md', name: 'index.md', size: 7, mimeType: 'text/markdown', mtimeMs: 21,
        kind: 'text', encoding: 'utf-8', content: 'current', delivery: 'inline',
      }))
      .mockResolvedValueOnce(json({ ok: true, path: 'wiki/index.md', size: 4, mtimeMs: 22 }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()

    await expect(spaces.readText('space-1', 'wiki/index.md')).resolves.toEqual({
      spaceId: 'space-1', path: 'wiki/index.md', content: 'hello', revision: '20:5',
    })
    await expect(spaces.writeText('space-1', 'wiki/index.md', 'mine', '20:5')).resolves.toEqual({
      ok: false,
      error: {
        code: 'version-conflict',
        current: { spaceId: 'space-1', path: 'wiki/index.md', content: 'current', revision: '21:7' },
      },
    })
    await expect(spaces.writeText('space-1', 'wiki/index.md', 'next', '21:7')).resolves.toEqual({
      ok: true,
      value: { spaceId: 'space-1', path: 'wiki/index.md', content: 'next', revision: '22:4' },
    })
    expect(JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string)).toEqual({
      path: 'wiki/index.md', content: 'mine', encoding: 'utf-8', expected: { mtimeMs: 20, size: 5 },
    })
  })

  it('fails explicitly on malformed paths, unavailable files, binary data, and API errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ path: 'asset.bin', retryAfterMs: 750 }))
      .mockResolvedValueOnce(json({
        path: 'asset.bin', name: 'asset.bin', size: 2, mimeType: 'application/octet-stream', mtimeMs: 3,
        kind: 'binary', encoding: 'base64', content: 'AAE=', delivery: 'inline',
      }))
      .mockResolvedValueOnce(json({ message: 'space forbidden' }, 403))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()

    await expect(spaces.listDirectory('space-1', '../secret')).rejects.toThrow(/invalid segment/)
    await expect(spaces.readText('space-1', 'asset.bin')).rejects.toBeInstanceOf(CohubSpaceFilePreparingError)
    await expect(spaces.readText('space-1', 'asset.bin')).rejects.toThrow(/only inline UTF-8/)
    await expect(spaces.listSpaces()).rejects.toBeInstanceOf(CohubSpacesHttpError)
  })

  it('forwards account changes and aborts in-flight HTTP when unloaded', async () => {
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init?.signal as AbortSignal
      requestSignal.addEventListener('abort', () => {
        reject(requestSignal?.reason instanceof Error ? requestSignal.reason : new Error('request aborted'))
      }, { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx, fiber, account, spaces } = await boot()
    const changed = vi.fn()
    ctx.on('cohub-spaces/changed', changed)
    account.notify()
    expect(changed).toHaveBeenCalledTimes(1)

    const pending = spaces.listSpaces()
    await vi.waitFor(() => { expect(requestSignal).toBeInstanceOf(AbortSignal) })
    const disposed = fiber.dispose()
    await expect(pending).rejects.toThrow(/service disposed/)
    await disposed
    expect(requestSignal?.aborted).toBe(true)
    account.notify()
    expect(changed).toHaveBeenCalledTimes(1)
  })
})
