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
    ...overrides,
  }
}

function source(api: CohubSpacesRemoteApi, startDshSession = vi.fn(async () => {})): CohubSpacesRemoteRootSource {
  return new CohubSpacesRemoteRootSource(api, startDshSession)
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
    const provider = source(api)
    const { ctx, unregister } = await registry(provider)
    await provider.refresh()

    expect(ctx.remoteRoots.snapshot.getSnapshot()).toEqual({
      revision: 3,
      sources: [{
        sourceId: 'cohub.spaces',
        status: 'ready',
        roots: [
          {
            id: 'space-1', title: 'World Bible', marker: { kind: 'cloud', label: 'Cohub' },
            capabilities: { browse: true, read: false, write: false, workspace: true, conversation: true },
          },
          {
            id: 'space-2', title: 'Drafts', marker: { kind: 'cloud', label: 'Cohub' },
            capabilities: { browse: true, read: false, write: false, workspace: true, conversation: true },
          },
        ],
      }],
    })
    unregister()
    provider.dispose()
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
    const provider = source(api)
    const rootId = 'space-1' as RemoteResourceId
    const listing = await provider.list({ rootId, parentId: rootId })

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
    provider.dispose()
  })

  it('gives an untitled Cohub Session a stable display name', async () => {
    const provider = source(remote({
      listSessions: vi.fn(async spaceId => ({
        spaceId,
        sessions: [{
          id: '18c0d6a5-0079-47e4-8808-9c384b5d3b4b', spaceId, title: '   ', status: 'active',
          latestMessageText: 'Investigate the build', updatedAt: '2026-08-17T10:00:00.000Z',
        }],
      })),
    }))
    const rootId = 'space-1' as RemoteResourceId

    await expect(provider.list({ rootId, parentId: rootId })).resolves.toMatchObject({
      entries: [{ name: 'Investigate the build' }],
    })
    provider.dispose()
  })

  it('projects Cohub history and starts a DSH Session for the selected Space', async () => {
    const getConversation = vi.fn(async (spaceId: string, sessionId: string) => ({
      spaceId,
      session: { id: sessionId, spaceId, title: 'Existing chat', status: 'active', updatedAt: '2026-08-16T10:00:00.000Z' },
      turns: [{
        id: 'turn-1', sessionId, sequence: 1, status: 'completed', userText: 'hello', assistantText: 'world',
        createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T10:00:01.000Z',
      }],
    }))
    const startDshSession = vi.fn(async () => {})
    const provider = source(remote({ getConversation }), startDshSession)
    const rootId = 'space-1' as RemoteResourceId
    const existingId = JSON.stringify(['space-1', 'session-1']) as RemoteResourceId

    await expect(provider.readConversation({ rootId, sessionId: existingId })).resolves.toMatchObject({
      rootId,
      session: { id: existingId, title: 'Existing chat', status: 'active' },
      turns: [{ id: JSON.stringify(['space-1', 'session-1', 'turn-1']), userText: 'hello', assistantText: 'world' }],
    })
    await expect(provider.startWorkspace({ rootId })).resolves.toBeUndefined()
    expect(getConversation).toHaveBeenCalledWith('space-1', 'session-1')
    expect(startDshSession).toHaveBeenCalledWith('space-1')
    provider.dispose()
  })

  it('publishes failures, recovers on refresh, and ignores completion after disposal', async () => {
    let resolveLate!: (value: readonly { id: string; title: string }[]) => void
    const api = remote({
      listSpaces: vi.fn()
        .mockRejectedValueOnce(new Error('sign in required'))
        .mockResolvedValueOnce([{ id: 'space-1', title: 'Recovered' }])
        .mockImplementationOnce(() => new Promise((resolve) => { resolveLate = resolve })),
    })
    const provider = source(api)
    await provider.refresh()
    expect(provider.snapshot.getSnapshot()).toEqual({ status: 'error', roots: [], message: 'sign in required' })
    await provider.refresh()
    expect(provider.snapshot.getSnapshot()).toMatchObject({
      status: 'ready', roots: [{ id: 'space-1', title: 'Recovered' }],
    })

    const late = provider.refresh()
    await Promise.resolve()
    provider.dispose()
    resolveLate([{ id: 'space-late', title: 'Late' }])
    await late
    expect(provider.snapshot.getSnapshot()).toEqual({ status: 'loading', roots: [] })
  })

  it('keeps account transport failures visible without calling the Space API', async () => {
    const listSpaces = vi.fn(async () => [])
    const provider = source(remote({
      getAccount: vi.fn(async () => { throw new Error('account carrier offline') }),
      listSpaces,
    }))
    await provider.refresh()
    expect(provider.snapshot.getSnapshot()).toEqual({
      status: 'error', roots: [], message: 'account carrier offline',
    })
    expect(listSpaces).not.toHaveBeenCalled()
    provider.dispose()
  })

  it('rejects an aborted operation while safely observing its late Remote result', async () => {
    let resolve!: (value: { spaceId: string; sessions: readonly [] }) => void
    const api = remote({
      listSessions: vi.fn(() => new Promise<{ spaceId: string; sessions: readonly [] }>(
        (done) => { resolve = done },
      )),
    })
    const provider = source(api)
    const controller = new AbortController()
    const rootId = 'space-1' as RemoteResourceId
    const pending = provider.list({ rootId, parentId: rootId, signal: controller.signal })
    controller.abort(new Error('closed Space'))
    await expect(pending).rejects.toThrow('closed Space')
    resolve({ spaceId: 'space-1', sessions: [] })
    await Promise.resolve()
    provider.dispose()
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
    const create = vi.fn(async () => 'dsh-session-1')
    const open = vi.fn()
    const createWorkspace = vi.fn(async () => ({ workspaceId: 'local-workspace-1' }))
    const getDshSessionStart = vi.fn(async () => ({
      ok: true as const,
      value: { spaceId: 'space-1', cwd: '/local/deepseek-harness' },
    }))
    const bindDshSession = vi.fn(async () => ({
      ok: true as const,
      value: { spaceId: 'space-1', spaceTitle: 'World', dshSessionId: 'dsh-session-1' },
    }))
    const ctx = {
      remote: {
        cohubAccount: { getAccount },
        cohubSpaces: {
          listSpaces,
          listSessions: vi.fn(),
          getConversation: vi.fn(),
          getDshSessionStart,
          bindDshSession,
        },
        $on: vi.fn((_event, listener: () => void) => { changed = listener; return off }),
      },
      remoteRoots: { register },
      sessions: { create, open },
      workspaces: { create: createWorkspace },
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
    await registeredSource!.startWorkspace({ rootId: 'space-1' as RemoteResourceId })
    expect(getDshSessionStart).toHaveBeenCalledWith('space-1')
    expect(createWorkspace).toHaveBeenCalledWith({ path: '/local/deepseek-harness' })
    expect(create).toHaveBeenCalledWith({ workspaceId: 'local-workspace-1' })
    expect(bindDshSession).toHaveBeenCalledWith('space-1', 'dsh-session-1')
    expect(open).toHaveBeenCalledWith('dsh-session-1')
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(bindDshSession.mock.invocationCallOrder[0]!)
    expect(bindDshSession.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]!)
    dispose()
    expect(off).toHaveBeenCalledOnce()
    expect(unregister).toHaveBeenCalledOnce()
  })
})
