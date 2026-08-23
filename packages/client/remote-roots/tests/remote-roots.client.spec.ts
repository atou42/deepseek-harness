import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  RemoteDirectoryListing, RemoteResourceId, RemoteRootSource, RemoteRootSourceId, RemoteRootSourceSnapshot,
  RemoteTextFile, RemoteTextWriteResult,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import { RemoteRootsService } from '../src/client/service.ts'

const sourceId = (value: string) => value as RemoteRootSourceId
const resourceId = (value: string) => value as RemoteResourceId

async function bench() {
  const ctx = new Context()
  await ctx.plugin(RemoteRootsService).await()
  return { ctx, service: ctx.get('remoteRoots') as RemoteRootsService }
}

function provider(id = 'fixture.remote') {
  const snapshot = createSnapshotStore<RemoteRootSourceSnapshot>({ status: 'loading', roots: [] })
  const list = vi.fn(async ({ rootId, parentId }: {
    rootId: RemoteResourceId
    parentId: RemoteResourceId
  }): Promise<RemoteDirectoryListing> => ({
    rootId,
    parentId,
    entries: [],
  }))
  const source: RemoteRootSource = { id: sourceId(id), snapshot, list }
  return { source, snapshot, list }
}

describe('RemoteRootsService', () => {
  it('publishes a marked remote root without manufacturing a local path', async () => {
    const { service } = await bench()
    const fixture = provider()
    service.register(fixture.source)
    fixture.snapshot.set({
      status: 'ready',
      roots: [{
        id: resourceId('space:one'),
        title: 'Cloud Space',
        marker: { kind: 'cloud', label: 'Cloud' },
        conversationReference: '@[Cloud Space](cloud://spaces/one)',
        capabilities: { browse: true, read: true, write: false },
      }],
    })
    expect(service.snapshot.getSnapshot().sources).toEqual([{
      sourceId: sourceId('fixture.remote'),
      status: 'ready',
      roots: [{
        id: resourceId('space:one'),
        title: 'Cloud Space',
        marker: { kind: 'cloud', label: 'Cloud' },
        conversationReference: '@[Cloud Space](cloud://spaces/one)',
        capabilities: { browse: true, read: true, write: false },
      }],
    }])
    expect(JSON.stringify(service.snapshot.getSnapshot())).not.toContain('path')
  })

  it('publishes authentication-required without treating it as a provider failure', async () => {
    const { service } = await bench()
    const fixture = provider()
    service.register(fixture.source)
    fixture.snapshot.set({
      status: 'authentication-required',
      roots: [],
      provider: 'Cohub',
    } as unknown as RemoteRootSourceSnapshot)
    expect(service.snapshot.getSnapshot().sources).toEqual([{
      sourceId: sourceId('fixture.remote'),
      status: 'authentication-required',
      roots: [],
      provider: 'Cohub',
    }])
  })

  it('clones and deeply freezes provider snapshots', async () => {
    const { service } = await bench()
    const root = {
      id: resourceId('space:one'),
      title: 'Cloud Space',
      marker: { kind: 'cloud' as const, label: 'Cloud' },
      capabilities: { browse: true as const, read: true, write: false },
    }
    const sourceSnapshot: RemoteRootSourceSnapshot = { status: 'ready', roots: [root] }
    service.register({
      id: sourceId('mutable.remote'),
      snapshot: { getSnapshot: () => sourceSnapshot, subscribe: () => () => {} },
      list: async ({ rootId, parentId }) => ({ rootId, parentId, entries: [] }),
    })
    const published = service.snapshot.getSnapshot()
    root.title = 'Mutated'
    root.marker.label = 'Mutated'
    expect(published.sources[0]?.roots[0]?.title).toBe('Cloud Space')
    expect(published.sources[0]?.roots[0]?.marker.label).toBe('Cloud')
    expect(Object.isFrozen(published.sources[0]?.roots[0]?.marker)).toBe(true)
    expect(Object.isFrozen(published.sources[0]?.roots[0]?.capabilities)).toBe(true)
    expect(Object.isFrozen(published.sources[0]?.roots)).toBe(true)
  })

  it('rejects invalid marker and capability metadata', async () => {
    const { service } = await bench()
    const fixture = provider()
    service.register(fixture.source)
    expect(() => {
      fixture.snapshot.set({
        status: 'ready',
        roots: [{
          id: resourceId('space:one'),
          title: 'Cloud Space',
          marker: { kind: 'other', label: 'Cloud' },
          capabilities: { browse: true, read: true, write: false },
        }],
      } as unknown as RemoteRootSourceSnapshot)
    }).toThrow(/invalid marker kind/)
    expect(() => service.snapshot.getSnapshot()).toThrow(/invalid marker kind/)
    fixture.snapshot.set({ status: 'loading', roots: [] })
    expect(() => {
      fixture.snapshot.set({
        status: 'ready',
        roots: [{
          id: resourceId('space:one'),
          title: 'Cloud Space',
          marker: { kind: 'cloud', label: 'Cloud' },
          conversationReference: '   ',
          capabilities: { browse: true, read: true, write: false },
        }],
      } as unknown as RemoteRootSourceSnapshot)
    }).toThrow(/conversationReference must be a non-blank string/)
    fixture.snapshot.set({ status: 'loading', roots: [] })
    expect(() => {
      fixture.snapshot.set({
        status: 'ready',
        roots: [{
          id: resourceId('space:one'),
          title: 'Cloud Space',
          marker: { kind: 'cloud', label: 'Cloud' },
          capabilities: { browse: true, read: 'yes', write: false },
        }],
      } as unknown as RemoteRootSourceSnapshot)
    }).toThrow(/capability read must be a boolean/)
  })

  it('rejects duplicate source ids and frees the id on disposal', async () => {
    const { service } = await bench()
    const first = provider()
    const dispose = service.register(first.source)
    expect(() => service.register(provider().source)).toThrow(/already registered/)
    dispose()
    expect(() => service.register(provider().source)).not.toThrow()
  })

  it('withdraws source state and subscriptions when the owning fiber unloads', async () => {
    const { ctx, service } = await bench()
    const fixture = provider()
    const fiber = ctx.plugin({
      apply(pluginCtx: Context) {
        pluginCtx.effect(() => service.register(fixture.source), 'fixture remote root')
      },
    })
    await fiber.await()
    expect(service.snapshot.getSnapshot().sources).toHaveLength(1)
    await fiber.dispose()
    expect(service.snapshot.getSnapshot().sources).toEqual([])
    const revision = service.snapshot.getSnapshot().revision
    fixture.snapshot.set({ status: 'error', roots: [], message: 'late failure' })
    expect(service.snapshot.getSnapshot().revision).toBe(revision)
  })

  it('routes listing through opaque identities and preserves AbortSignal', async () => {
    const { service } = await bench()
    const fixture = provider()
    service.register(fixture.source)
    const abort = new AbortController()
    await service.list(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'),
      parentId: resourceId('folder:two'),
      signal: abort.signal,
    })
    expect(fixture.list).toHaveBeenCalledExactlyOnceWith({
      rootId: resourceId('space:one'),
      parentId: resourceId('folder:two'),
      signal: abort.signal,
    })
  })

  it('validates, clones, and freezes directory listings', async () => {
    const { service } = await bench()
    const fixture = provider()
    const entry = {
      id: resourceId('file:one'),
      parentId: resourceId('folder:two'),
      name: 'one.txt',
      kind: 'file' as const,
      revision: 'r1',
      size: 3,
    }
    fixture.list.mockResolvedValueOnce({
      rootId: resourceId('space:one'),
      parentId: resourceId('folder:two'),
      entries: [entry],
    })
    service.register(fixture.source)
    const listing = await service.list(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), parentId: resourceId('folder:two'),
    })
    entry.name = 'mutated.txt'
    expect(listing.entries[0]?.name).toBe('one.txt')
    expect(Object.isFrozen(listing)).toBe(true)
    expect(Object.isFrozen(listing.entries[0])).toBe(true)

    fixture.list.mockResolvedValueOnce({
      rootId: resourceId('wrong'), parentId: resourceId('folder:two'), entries: [],
    })
    await expect(service.list(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), parentId: resourceId('folder:two'),
    })).rejects.toThrow(/rootId does not match/)

    fixture.list.mockResolvedValueOnce({
      rootId: resourceId('space:one'),
      parentId: resourceId('folder:two'),
      entries: [entry, { ...entry }],
    })
    await expect(service.list(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), parentId: resourceId('folder:two'),
    })).rejects.toThrow(/duplicate entry/)

    fixture.list.mockResolvedValueOnce({
      rootId: resourceId('space:one'),
      parentId: resourceId('folder:two'),
      entries: [{ ...entry, size: -1 }],
    })
    await expect(service.list(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), parentId: resourceId('folder:two'),
    })).rejects.toThrow(/size must be a non-negative safe integer/)
  })

  it('validates and isolates read and write results', async () => {
    const { service } = await bench()
    const fixture = provider()
    const file: RemoteTextFile = {
      rootId: resourceId('space:one'),
      fileId: resourceId('file:one'),
      content: 'hello',
      revision: 'r1',
    }
    const read = vi.fn(async () => file)
    let writeResult: RemoteTextWriteResult = { ok: true, value: file }
    const write = vi.fn(async () => writeResult)
    service.register({ ...fixture.source, read, write })

    const readValue = await service.read(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), fileId: resourceId('file:one'),
    })
    ;(file as { content: string }).content = 'mutated'
    expect(readValue.content).toBe('hello')
    expect(Object.isFrozen(readValue)).toBe(true)

    writeResult = {
      ok: false,
      error: {
        code: 'version-conflict',
        current: { ...file, content: 'current', revision: 'r2' },
      },
    }
    const conflict = await service.write(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'),
      fileId: resourceId('file:one'),
      content: 'next',
      ifRevision: 'r1',
    })
    expect(conflict).toEqual({
      ok: false,
      error: { code: 'version-conflict', current: { ...file, content: 'current', revision: 'r2' } },
    })
    expect(Object.isFrozen(conflict)).toBe(true)
    expect(Object.isFrozen(conflict.ok ? conflict.value : conflict.error.current)).toBe(true)

    read.mockResolvedValueOnce({ ...file, fileId: resourceId('wrong') })
    await expect(service.read(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), fileId: resourceId('file:one'),
    })).rejects.toThrow(/fileId does not match/)

    writeResult = { ok: true, value: { ...file, revision: '' } }
    await expect(service.write(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'),
      fileId: resourceId('file:one'),
      content: 'next',
      ifRevision: 'r1',
    })).rejects.toThrow(/revision must be a non-blank string/)

    writeResult = { ok: false, error: { code: 'unsupported', current: file } } as unknown as RemoteTextWriteResult
    await expect(service.write(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'),
      fileId: resourceId('file:one'),
      content: 'next',
      ifRevision: 'r1',
    })).rejects.toThrow(/unsupported error code/)
  })

  it('rejects malformed requests before calling a provider', async () => {
    const { service } = await bench()
    const fixture = provider()
    service.register(fixture.source)
    await expect(service.list(sourceId('fixture.remote'), {
      rootId: resourceId(''), parentId: resourceId('folder'),
    })).rejects.toThrow(/request rootId must be a non-blank string/)
    expect(fixture.list).not.toHaveBeenCalled()
  })

  it('fails loudly for an unknown source or unsupported file operation', async () => {
    const { service } = await bench()
    await expect(service.list(sourceId('missing'), {
      rootId: resourceId('root'), parentId: resourceId('root'),
    })).rejects.toThrow(/unknown source/)
    service.register(provider().source)
    await expect(service.read(sourceId('fixture.remote'), {
      rootId: resourceId('root'), fileId: resourceId('file'),
    })).rejects.toThrow(/does not support reading/)
  })

  it('poisons the aggregate snapshot on malformed provider data until that provider recovers', async () => {
    const { service } = await bench()
    const fixture = provider()
    service.register(fixture.source)
    expect(() => {
      fixture.snapshot.set({
        status: 'ready',
        roots: [
          { id: resourceId('same'), title: 'A', marker: { kind: 'cloud', label: 'Cloud' }, capabilities: { browse: true, read: false, write: false } },
          { id: resourceId('same'), title: 'B', marker: { kind: 'cloud', label: 'Cloud' }, capabilities: { browse: true, read: false, write: false } },
        ],
      })
    }).toThrow(/duplicate root/)
    expect(() => service.snapshot.getSnapshot()).toThrow(/duplicate root/)
    fixture.snapshot.set({ status: 'loading', roots: [] })
    expect(service.snapshot.getSnapshot().sources[0]?.status).toBe('loading')
  })

  it('keeps local DSH startup separate from an interactive provider-owned conversation', async () => {
    const { service } = await bench()
    const fixture = provider()
    const readConversation = vi.fn(async () => ({
      rootId: resourceId('space:one'),
      session: undefined,
      turns: [],
    }))
    const startWorkspace = vi.fn(async () => {})
    const sendConversationMessage = vi.fn(async () => ({
      rootId: resourceId('space:one'),
      session: { id: resourceId('session:one'), title: 'Native chat', status: 'active' },
      turn: {
        id: resourceId('turn:one'), sequence: 1, status: 'queued', userText: 'hello',
        updatedAt: '2026-08-23T12:00:00.000Z',
      },
    }))
    const abortConversationTurn = vi.fn(async () => ({
      ok: true as const,
      rootId: resourceId('space:one'), sessionId: resourceId('session:one'), turnId: resourceId('turn:one'),
    }))
    service.register({
      ...fixture.source,
      readConversation,
      startWorkspace,
      sendConversationMessage,
      abortConversationTurn,
    } as unknown as RemoteRootSource)
    fixture.snapshot.set({
      status: 'ready',
      roots: [{
        id: resourceId('space:one'),
        title: 'Cloud Space',
        marker: { kind: 'cloud', label: 'Cloud' },
        capabilities: { browse: true, read: false, write: false, workspace: true, conversation: 'interactive' },
      }],
    } as unknown as RemoteRootSourceSnapshot)
    const conversations = service as unknown as {
      startWorkspace(sourceId: RemoteRootSourceId, rootId: RemoteResourceId): Promise<void>
      openConversation(sourceId: RemoteRootSourceId, rootId: RemoteResourceId, sessionId?: RemoteResourceId): Promise<void>
      readConversation(sourceId: RemoteRootSourceId, request: { rootId: RemoteResourceId; sessionId?: RemoteResourceId }): Promise<unknown>
      sendConversationMessage(sourceId: RemoteRootSourceId, request: {
        rootId: RemoteResourceId
        sessionId?: RemoteResourceId
        content: string
        clientMessageId: string
      }): Promise<unknown>
      abortConversationTurn(sourceId: RemoteRootSourceId, request: {
        rootId: RemoteResourceId
        sessionId: RemoteResourceId
        turnId: RemoteResourceId
      }): Promise<unknown>
    }

    await conversations.startWorkspace(sourceId('fixture.remote'), resourceId('space:one'))
    expect(startWorkspace).toHaveBeenCalledWith({ rootId: resourceId('space:one') })
    expect(service.snapshot.getSnapshot().active).toBeUndefined()

    await conversations.openConversation(sourceId('fixture.remote'), resourceId('space:one'))
    expect((service.snapshot.getSnapshot() as unknown as { active: unknown }).active).toEqual({
      sourceId: sourceId('fixture.remote'), rootId: resourceId('space:one'), rootTitle: 'Cloud Space', conversation: 'interactive',
    })
    await conversations.readConversation(sourceId('fixture.remote'), { rootId: resourceId('space:one') })
    expect(readConversation).toHaveBeenCalledWith({ rootId: resourceId('space:one'), sessionId: undefined })

    await expect(conversations.sendConversationMessage(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), content: 'hello', clientMessageId: 'message:one',
    })).resolves.toMatchObject({ session: { id: resourceId('session:one') }, turn: { id: resourceId('turn:one') } })
    expect(service.snapshot.getSnapshot().active).toEqual({
      sourceId: sourceId('fixture.remote'), rootId: resourceId('space:one'), rootTitle: 'Cloud Space',
      conversation: 'interactive', sessionId: resourceId('session:one'), sessionTitle: 'Native chat',
    })
    await expect(conversations.abortConversationTurn(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), sessionId: resourceId('session:one'), turnId: resourceId('turn:one'),
    })).resolves.toMatchObject({ ok: true, turnId: resourceId('turn:one') })
    expect(sendConversationMessage).toHaveBeenCalledOnce()
    expect(abortConversationTurn).toHaveBeenCalledOnce()
  })

  it('validates and detaches structured provider conversation blocks', async () => {
    const { service } = await bench()
    const fixture = provider()
    const raw = {
      rootId: resourceId('space:one'),
      session: { id: resourceId('session:one'), title: 'Native chat', status: 'active' },
      turns: [{
        id: resourceId('turn:one'), sequence: 1, status: 'completed',
        blocks: [
          { kind: 'text', text: 'answer' },
          { kind: 'thinking', text: 'reason' },
          { kind: 'image', source: { kind: 'url', url: 'https://example.test/a.png' } },
          { kind: 'image', source: { kind: 'base64', mediaType: 'image/png', data: 'YWJj' } },
          { kind: 'shell-command', command: 'pwd', rawText: 'pwd' },
          { kind: 'tool-use', id: 'tool-1', name: 'Bash', input: { args: ['pwd', 1, true, null] } },
          { kind: 'tool-result', toolUseId: 'tool-1', content: 'ok', isError: false },
          { kind: 'tool-result', toolUseId: 'tool-2', content: [{ kind: 'system-note', noteType: 'info', text: 'note' }], isError: true },
          { kind: 'system-note', noteType: 'compacted', text: 'compacted' },
        ],
        updatedAt: '2026-08-23T12:00:00.000Z',
      }],
    }
    const readConversation = vi.fn()
      .mockResolvedValueOnce(raw)
      .mockResolvedValueOnce({
        ...raw,
        turns: [{ ...raw.turns[0], blocks: [{ kind: 'tool-use', id: 'tool-bad', name: 'Bad', input: { value: Number.POSITIVE_INFINITY } }] }],
      })
    service.register({ ...fixture.source, readConversation })

    const value = await service.readConversation(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), sessionId: resourceId('session:one'),
    })
    ;(raw.turns[0]!.blocks[0] as { text: string }).text = 'mutated'
    expect(value.turns[0]?.blocks?.[0]).toEqual({ kind: 'text', text: 'answer' })
    expect(Object.isFrozen(value.turns[0]?.blocks)).toBe(true)
    expect(Object.isFrozen(value.turns[0]?.blocks?.[5])).toBe(true)
    await expect(service.readConversation(sourceId('fixture.remote'), {
      rootId: resourceId('space:one'), sessionId: resourceId('session:one'),
    })).rejects.toThrow(/must contain finite numbers/)
  })
})
