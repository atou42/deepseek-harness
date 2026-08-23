import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { RemoteRootsService } from '@deepseek-ai/dsh-client-remote-roots/src/client/service.ts'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResourceId } from '@deepseek-ai/dsh-client-remote-roots/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {
  apply,
  CohubSpacesRemoteRootSource,
  createCohubSpaceReferenceSource,
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
    sendPrompt: vi.fn(async () => { throw new Error('no prompt expected') }),
    abortTurn: vi.fn(async () => { throw new Error('no abort expected') }),
    ...overrides,
  }
}

function source(api: CohubSpacesRemoteApi): CohubSpacesRemoteRootSource {
  return new CohubSpacesRemoteRootSource(api)
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
            capabilities: { browse: true, read: false, write: false, workspace: false, conversation: 'interactive' },
          },
          {
            id: 'space-2', title: 'Drafts', marker: { kind: 'cloud', label: 'Cohub' },
            capabilities: { browse: true, read: false, write: false, workspace: false, conversation: 'interactive' },
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
      listSessions: vi.fn(async (spaceId: string) => ({
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

  it('projects Cohub history without exposing a local DSH start mode', async () => {
    const getConversation = vi.fn(async (spaceId: string, sessionId: string) => ({
      spaceId,
      session: { id: sessionId, spaceId, title: 'Existing chat', status: 'active', updatedAt: '2026-08-16T10:00:00.000Z' },
      turns: [{
        id: 'turn-1', sessionId, sequence: 1, status: 'completed', userText: 'hello', assistantText: 'world',
        createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T10:00:01.000Z',
      }],
    }))
    const provider = source(remote({ getConversation }))
    const rootId = 'space-1' as RemoteResourceId
    const existingId = JSON.stringify(['space-1', 'session-1']) as RemoteResourceId

    await expect(provider.readConversation({ rootId, sessionId: existingId })).resolves.toMatchObject({
      rootId,
      session: { id: existingId, title: 'Existing chat', status: 'active' },
      turns: [{ id: JSON.stringify(['space-1', 'session-1', 'turn-1']), userText: 'hello', assistantText: 'world' }],
    })
    expect(getConversation).toHaveBeenCalledWith('space-1', 'session-1')
    expect('startWorkspace' in provider).toBe(false)
    provider.dispose()
  })

  it('exposes Cohub Spaces as searchable @ references for local DSH Sessions', async () => {
    const provider = source(remote({
      listSpaces: vi.fn(async () => [
        { id: 'space/a', title: 'World Bible' },
        { id: 'space-b', title: 'Drafts' },
      ]),
    }))
    await provider.refresh()
    const reference = createCohubSpaceReferenceSource(provider.snapshot)
    const signal = new AbortController().signal

    const candidates = await reference.candidates(
      { sessionId: 'local-session' as never },
      { query: 'world', position: 'inline', signal },
    )
    expect(candidates).toEqual([{
      name: 'World Bible', description: 'Cohub 云端资产', section: 'Cohub Spaces',
      value: JSON.stringify({ version: 1, spaceId: 'space/a', title: 'World Bible' }),
    }])
    const picked = reference.onPick({
      candidate: candidates[0]!, session: { sessionId: 'local-session' as never },
      position: 'inline', via: 'menu', span: { start: 0, end: 6, draftRev: 1 },
    })
    expect(picked).toEqual({
      insert: {
        source: 'cohub-space',
        ref: JSON.stringify({ version: 1, spaceId: 'space/a', title: 'World Bible' }),
        label: 'World Bible', appearance: 'folder',
        clipboardText: '@[World Bible](cohub-space:space%2Fa)',
      },
    })
    const ref = (picked as { insert: { ref: string } }).insert.ref
    await expect(reference.codec?.serialize(ref, signal)).resolves.toBe(
      'Cohub Space reference: title="World Bible", space_id="space/a". Use the cohub_space_* tools with this exact space_id to access its cloud assets. Do not treat it as a local path.',
    )
    expect(reference.codec?.clipboardText(ref)).toBe('@[World Bible](cohub-space:space%2Fa)')
    expect(() => reference.codec?.clipboardText('{}')).toThrow(/reference is malformed/)
    provider.dispose()
  })

  it('routes native messages and aborts through opaque Cohub Session and Turn identities', async () => {
    const sendPrompt = vi.fn(async () => ({
      spaceId: 'space-1',
      session: {
        id: 'session-1', spaceId: 'space-1', title: 'Native chat', status: 'active',
        updatedAt: '2026-08-23T12:00:00.000Z',
      },
      turn: {
        id: 'turn-1', sessionId: 'session-1', sequence: 1, status: 'queued', userText: 'hello',
        createdAt: '2026-08-23T12:00:00.000Z', updatedAt: '2026-08-23T12:00:00.000Z',
      },
    }))
    const abortTurn = vi.fn(async () => ({
      ok: true as const, spaceId: 'space-1', sessionId: 'session-1', turnId: 'turn-1',
    }))
    const api = remote()
    Object.assign(api, { sendPrompt, abortTurn })
    const provider = source(api)
    const native = provider as unknown as {
      sendConversationMessage(request: {
        rootId: RemoteResourceId
        sessionId?: RemoteResourceId
        content: string
        clientMessageId: string
      }): Promise<unknown>
      abortConversationTurn(request: {
        rootId: RemoteResourceId
        sessionId: RemoteResourceId
        turnId: RemoteResourceId
      }): Promise<unknown>
    }
    const rootId = 'space-1' as RemoteResourceId

    const submission = await native.sendConversationMessage({
      rootId, content: 'hello', clientMessageId: 'message-1',
    }) as { session: { id: RemoteResourceId }; turn: { id: RemoteResourceId } }
    expect(submission).toMatchObject({
      rootId,
      session: { id: JSON.stringify(['space-1', 'session-1']), title: 'Native chat' },
      turn: { id: JSON.stringify(['space-1', 'session-1', 'turn-1']), status: 'queued', userText: 'hello' },
    })
    expect(sendPrompt).toHaveBeenCalledWith('space-1', null, 'hello', 'message-1')

    await expect(native.abortConversationTurn({
      rootId,
      sessionId: submission.session.id,
      turnId: submission.turn.id,
    })).resolves.toEqual({
      ok: true, rootId, sessionId: submission.session.id, turnId: submission.turn.id,
    })
    expect(abortTurn).toHaveBeenCalledWith('space-1', 'session-1', 'turn-1')
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
    let referenceSource: InputTriggerSource | undefined
    const unregisterReference = vi.fn()
    const ctx = {
      remote: {
        cohubAccount: { getAccount },
        cohubSpaces: {
          listSpaces,
          listSessions: vi.fn(),
          getConversation: vi.fn(),
        },
        $on: vi.fn((_event, listener: () => void) => { changed = listener; return off }),
      },
      remoteRoots: { register },
      inputTriggers: {
        registerSource: vi.fn((source: InputTriggerSource) => {
          referenceSource = source
          return unregisterReference
        }),
      },
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
    expect(referenceSource?.name).toBe('cohub-space')
    dispose()
    expect(off).toHaveBeenCalledOnce()
    expect(unregister).toHaveBeenCalledOnce()
    expect(unregisterReference).toHaveBeenCalledOnce()
  })
})
