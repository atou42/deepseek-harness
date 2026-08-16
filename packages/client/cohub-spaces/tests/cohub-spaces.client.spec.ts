import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { RemoteRootsService } from '@deepseek-ai/dsh-client-remote-roots/src/client/service.ts'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResourceId } from '@deepseek-ai/dsh-client-remote-roots/client'
import {
  apply,
  CohubSpacesRemoteRootSource,
  type CohubSpacesRemoteApi,
} from '../src/client/index.ts'

function remote(overrides: Partial<CohubSpacesRemoteApi> = {}): CohubSpacesRemoteApi {
  return {
    getAccount: vi.fn(async () => ({
      revision: 1, status: 'authenticated' as const,
      profile: { userId: 'user-1' }, accessTokenExpiresAt: Date.now() + 60_000,
    })),
    listSpaces: vi.fn(async () => []),
    listSessions: vi.fn(async (spaceId: string) => ({ spaceId, sessions: [] })),
    getConversation: vi.fn(async () => { throw new Error('no Session selected') }),
    promptConversation: vi.fn(async () => { throw new Error('prompt not configured') }),
    ...overrides,
  }
}

async function registry(source: CohubSpacesRemoteRootSource) {
  const ctx = new Context()
  await ctx.plugin(RemoteRootsService)
  const unregister = ctx.remoteRoots.register(source)
  return { ctx, unregister }
}

describe('CohubSpacesRemoteRootSource', () => {
  it('publishes marked Space roots through the generic registry', async () => {
    const api = remote({
      listSpaces: vi.fn(async () => [
        { id: 'space-1', title: 'World Bible' },
        { id: 'space-2', title: 'Drafts' },
      ]),
    })
    const source = new CohubSpacesRemoteRootSource(api)
    const { ctx, unregister } = await registry(source)
    await source.refresh()

    expect(ctx.remoteRoots.snapshot.getSnapshot()).toEqual({
      revision: 3,
      sources: [{
        sourceId: 'cohub.spaces',
        status: 'ready',
        roots: [
          {
            id: 'space-1', title: 'World Bible', marker: { kind: 'cloud', label: 'Cohub' },
            capabilities: { browse: true, read: false, write: false, conversation: true },
          },
          {
            id: 'space-2', title: 'Drafts', marker: { kind: 'cloud', label: 'Cohub' },
            capabilities: { browse: true, read: false, write: false, conversation: true },
          },
        ],
      }],
    })
    unregister()
    source.dispose()
    expect(ctx.remoteRoots.snapshot.getSnapshot().sources).toEqual([])
    await ctx.fiber.dispose()
  })

  it('shows Cohub Sessions under each Space instead of Space files', async () => {
    const listSessions = vi.fn(async (spaceId: string) => ({
      spaceId,
      sessions: [
        {
          id: 'session-1', spaceId, title: 'First conversation', status: 'active',
          latestMessageText: 'latest answer', updatedAt: '2026-08-16T10:00:00.000Z',
        },
        {
          id: 'session-2', spaceId, title: 'Second conversation', status: 'active',
          updatedAt: '2026-08-16T09:00:00.000Z',
        },
      ],
    }))
    const api = remote({ listSessions })
    const source = new CohubSpacesRemoteRootSource(api)
    const rootId = 'space-1' as RemoteResourceId
    const listing = await source.list({ rootId, parentId: rootId })

    expect(listSessions).toHaveBeenCalledWith('space-1')
    expect(listing).toEqual({
      rootId,
      parentId: rootId,
      entries: [
        {
          id: JSON.stringify(['space-1', 'session-1']), parentId: rootId,
          name: 'First conversation', kind: 'session', revision: '2026-08-16T10:00:00.000Z',
        },
        {
          id: JSON.stringify(['space-1', 'session-2']), parentId: rootId,
          name: 'Second conversation', kind: 'session', revision: '2026-08-16T09:00:00.000Z',
        },
      ],
    })
    expect(JSON.stringify(listing)).not.toContain('/workspace')
    source.dispose()
  })

  it('projects Cohub history and first-prompt creation through opaque remote identities', async () => {
    const getConversation = vi.fn(async (spaceId: string, sessionId: string) => ({
      spaceId,
      session: { id: sessionId, spaceId, title: 'Existing chat', status: 'active', updatedAt: '2026-08-16T10:00:00.000Z' },
      turns: [{
        id: 'turn-1', sessionId, sequence: 1, status: 'completed', userText: 'hello', assistantText: 'world',
        createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T10:00:01.000Z',
      }],
    }))
    const promptConversation = vi.fn(async (spaceId: string) => ({
      spaceId, sessionId: 'session-new', sessionTitle: 'New chat', turnId: 'turn-new', turnStatus: 'running',
    }))
    const source = new CohubSpacesRemoteRootSource(remote({ getConversation, promptConversation }))
    const rootId = 'space-1' as RemoteResourceId
    const existingId = JSON.stringify(['space-1', 'session-1']) as RemoteResourceId

    await expect(source.readConversation({ rootId, sessionId: existingId })).resolves.toMatchObject({
      rootId,
      session: { id: existingId, title: 'Existing chat', status: 'active' },
      turns: [{ id: JSON.stringify(['space-1', 'session-1', 'turn-1']), userText: 'hello', assistantText: 'world' }],
    })
    await expect(source.promptConversation({ rootId, text: 'start here' })).resolves.toEqual({
      rootId,
      sessionId: JSON.stringify(['space-1', 'session-new']),
      sessionTitle: 'New chat',
      turnId: JSON.stringify(['space-1', 'session-new', 'turn-new']),
      turnStatus: 'running',
    })
    expect(getConversation).toHaveBeenCalledWith('space-1', 'session-1')
    expect(promptConversation).toHaveBeenCalledWith('space-1', undefined, 'start here')
    source.dispose()
  })

  it('publishes failures, recovers on refresh, and ignores completion after disposal', async () => {
    let resolveLate!: (value: readonly { id: string; title: string }[]) => void
    const api = remote({
      listSpaces: vi.fn()
        .mockRejectedValueOnce(new Error('sign in required'))
        .mockResolvedValueOnce([{ id: 'space-1', title: 'Recovered' }])
        .mockImplementationOnce(() => new Promise((resolve) => { resolveLate = resolve })),
    })
    const source = new CohubSpacesRemoteRootSource(api)
    await source.refresh()
    expect(source.snapshot.getSnapshot()).toEqual({ status: 'error', roots: [], message: 'sign in required' })
    await source.refresh()
    expect(source.snapshot.getSnapshot()).toMatchObject({
      status: 'ready', roots: [{ id: 'space-1', title: 'Recovered' }],
    })

    const late = source.refresh()
    await Promise.resolve()
    source.dispose()
    resolveLate([{ id: 'space-late', title: 'Late' }])
    await late
    expect(source.snapshot.getSnapshot()).toEqual({ status: 'loading', roots: [] })
  })

  it('keeps account transport failures visible without calling the Space API', async () => {
    const listSpaces = vi.fn(async () => [])
    const source = new CohubSpacesRemoteRootSource(remote({
      getAccount: vi.fn(async () => { throw new Error('account carrier offline') }),
      listSpaces,
    }))
    await source.refresh()
    expect(source.snapshot.getSnapshot()).toEqual({
      status: 'error', roots: [], message: 'account carrier offline',
    })
    expect(listSpaces).not.toHaveBeenCalled()
    source.dispose()
  })

  it('rejects an aborted operation while safely observing its late Remote result', async () => {
    let resolve!: (value: { spaceId: string; sessions: readonly [] }) => void
    const api = remote({
      listSessions: vi.fn(() => new Promise<{ spaceId: string; sessions: readonly [] }>(
        (done) => { resolve = done },
      )),
    })
    const source = new CohubSpacesRemoteRootSource(api)
    const controller = new AbortController()
    const rootId = 'space-1' as RemoteResourceId
    const pending = source.list({ rootId, parentId: rootId, signal: controller.signal })
    controller.abort(new Error('closed Space'))
    await expect(pending).rejects.toThrow('closed Space')
    resolve({ spaceId: 'space-1', sessions: [] })
    await Promise.resolve()
    source.dispose()
  })

  it('publishes authentication-required and avoids Space I/O while anonymous', async () => {
    const unregister = vi.fn()
    const off = vi.fn()
    let registeredSource: CohubSpacesRemoteRootSource | undefined
    const register = vi.fn((source: CohubSpacesRemoteRootSource) => {
      registeredSource = source
      return unregister
    })
    let changed!: () => void
    const getAccount = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: { revision: 0, status: 'anonymous' as const } })
      .mockResolvedValueOnce({
        ok: true as const,
        value: {
          revision: 1, status: 'authenticated' as const, profile: { userId: 'user-1' },
          accessTokenExpiresAt: Date.now() + 60_000,
        },
      })
    const listSpaces = vi.fn(async () => ({
      ok: true as const, value: [{ id: 'space-1', title: 'World' }],
    }))
    const ctx = {
      remote: {
        cohubAccount: { getAccount },
        cohubSpaces: {
          listSpaces,
          listSessions: vi.fn(),
          getConversation: vi.fn(),
          promptConversation: vi.fn(),
        },
        $on: vi.fn((_event, listener: () => void) => { changed = listener; return off }),
      },
      remoteRoots: { register },
    } as unknown as ClientContext

    const dispose = apply(ctx)
    await vi.waitFor(() => {
      if (registeredSource === undefined) throw new Error('source not registered')
      expect(registeredSource.snapshot.getSnapshot()).toEqual({
        status: 'authentication-required', roots: [], provider: 'Cohub',
      })
    })
    expect(listSpaces).not.toHaveBeenCalled()

    changed()
    await vi.waitFor(() => {
      if (registeredSource === undefined) throw new Error('source not registered')
      expect(registeredSource.snapshot.getSnapshot()).toMatchObject({
        status: 'ready', roots: [{ id: 'space-1', title: 'World' }],
      })
    })
    expect(listSpaces).toHaveBeenCalledOnce()
    dispose()
    expect(off).toHaveBeenCalledOnce()
    expect(unregister).toHaveBeenCalledOnce()
  })
})
