import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import CohubBoardGateway, { CohubBoardHttpError, parseBoardManifest } from '../src/index.ts'

const contexts: Context[] = []

class TestAccount extends Service {
  readonly snapshot = { getSnapshot: () => ({ revision: 1, status: 'authenticated' as const }), subscribe: () => () => {} }
  constructor(ctx: Context) { super(ctx, 'cohubAccount') }
  getAccessToken(): Promise<string> { return Promise.resolve('secret-account-token') }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function node(overrides: Record<string, unknown> = {}) {
  return {
    boardId: 'board-1', nodeId: 'node-1', type: 'text', parentId: null, orderKey: '00000000',
    x: 10, y: 20, width: 200, height: 100, rotation: 0, refKind: null, refPath: null, refUrl: null,
    view: {}, style: {}, data: { text: 'Hello' }, version: 2,
    createdAt: '2026-08-16T00:00:00.000Z', updatedAt: null, ...overrides,
  }
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    board: { id: 'board-1', spaceId: 'space-1', title: 'Ideas', version: 3, metadata: {}, createdAt: null, updatedAt: null },
    nodes: [node()], connections: [], ...overrides,
  }
}

async function boot() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(TestAccount)
  const fiber = ctx.plugin(CohubBoardGateway, { apiBaseUrl: 'https://cohub.example.test/' })
  await fiber.await()
  return { ctx, fiber, board: ctx.cohubBoard }
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('CohubBoardGateway', () => {
  it('exposes only the read-only Board method and authenticates on the Host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(snapshot()))
    vi.stubGlobal('fetch', fetchMock)
    const { board } = await boot()
    expect(remoteMethods(board)).toEqual([{ method: 'getBoard', invocation: { kind: 'direct' } }])
    const result = await board.getBoard('space-1', 'board-1')
    expect(result).toMatchObject({
      board: { id: 'board-1', spaceId: 'space-1', title: 'Ideas' },
      nodes: [{ nodeId: 'node-1', data: { text: 'Hello' } }],
      connections: [],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cohub.example.test/api/spaces/space-1/board/board-1?include=nodes&include=connections')
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('GET')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret-account-token')
    expect(JSON.stringify(result)).not.toContain('secret-account-token')
  })

  it('accepts valid manifests and rejects invalid or unsupported manifests', () => {
    expect(parseBoardManifest(JSON.stringify({
      kind: 'cohub.board.manifest', version: 1,
      boardId: '123e4567-e89b-12d3-a456-426614174000', title: 'Story map',
    }))).toEqual({ kind: 'cohub.board.manifest', version: 1, boardId: '123e4567-e89b-12d3-a456-426614174000', title: 'Story map' })
    expect(() => parseBoardManifest('{')).toThrow(/valid JSON/)
    expect(() => parseBoardManifest(JSON.stringify({ kind: 'cohub.board.manifest', version: 2, boardId: 'x', title: 'x' }))).toThrow(/unsupported/)
  })

  it('rejects mismatched, duplicate, invalid geometry, and dangling graph data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(snapshot({ board: { ...snapshot().board as object, spaceId: 'other' } })))
      .mockResolvedValueOnce(json(snapshot({ nodes: [node(), node()] })))
      .mockResolvedValueOnce(json(snapshot({ nodes: [node({ width: 0 })] })))
      .mockResolvedValueOnce(json(snapshot({ connections: [{
        id: 'edge-1', boardId: 'board-1', source: { nodeId: 'node-1' }, target: { nodeId: 'missing' },
        relation: 'related', direction: 'forward', label: '', revision: 0,
      }] })))
    vi.stubGlobal('fetch', fetchMock)
    const { board } = await boot()
    await expect(board.getBoard('space-1', 'board-1')).rejects.toThrow(/Space id does not match/)
    await expect(board.getBoard('space-1', 'board-1')).rejects.toThrow(/duplicate node id/)
    await expect(board.getBoard('space-1', 'board-1')).rejects.toThrow(/invalid geometry/)
    await expect(board.getBoard('space-1', 'board-1')).rejects.toThrow(/missing node/)
  })

  it('reports API errors without leaking the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Board forbidden' }, 403)))
    const { board } = await boot()
    const pending = board.getBoard('space-1', 'board-1')
    await expect(pending).rejects.toBeInstanceOf(CohubBoardHttpError)
    await expect(pending).rejects.not.toThrow(/secret-account-token/)
  })

  it('aborts in-flight inspection when unloaded', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal as AbortSignal
      signal.addEventListener('abort', () => {
        reject(signal?.reason instanceof Error ? signal.reason : new Error('request aborted'))
      }, { once: true })
    })))
    const { board, fiber } = await boot()
    const pending = board.getBoard('space-1', 'board-1')
    await vi.waitFor(() => { expect(signal).toBeInstanceOf(AbortSignal) })
    const disposed = fiber.dispose()
    await expect(pending).rejects.toThrow(/service disposed/)
    await disposed
    expect(signal?.aborted).toBe(true)
  })
})
