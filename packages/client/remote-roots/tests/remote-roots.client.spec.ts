import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  RemoteResourceId, RemoteRootSource, RemoteRootSourceId, RemoteRootSourceSnapshot,
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
  const list = vi.fn(async ({ rootId, parentId }: { rootId: RemoteResourceId; parentId: RemoteResourceId }) => ({
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
        capabilities: { browse: true, read: true, write: false },
      }],
    }])
    expect(JSON.stringify(service.snapshot.getSnapshot())).not.toContain('path')
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
    expect(() => fixture.snapshot.set({
      status: 'ready',
      roots: [
        { id: resourceId('same'), title: 'A', marker: { kind: 'cloud', label: 'Cloud' }, capabilities: { browse: true, read: false, write: false } },
        { id: resourceId('same'), title: 'B', marker: { kind: 'cloud', label: 'Cloud' }, capabilities: { browse: true, read: false, write: false } },
      ],
    })).toThrow(/duplicate root/)
    expect(() => service.snapshot.getSnapshot()).toThrow(/duplicate root/)
    fixture.snapshot.set({ status: 'loading', roots: [] })
    expect(service.snapshot.getSnapshot().sources[0]?.status).toBe('loading')
  })
})
