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
    listDirectory: vi.fn(async (spaceId: string, path: string) => ({ spaceId, path, entries: [] })),
    readText: vi.fn(async (spaceId: string, path: string) => ({ spaceId, path, content: '', revision: '1:0' })),
    writeText: vi.fn(async (spaceId: string, path: string, content: string) => ({
      ok: true as const,
      value: { spaceId, path, content, revision: '2:0' },
    })),
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
            capabilities: { browse: true, read: true, write: true },
          },
          {
            id: 'space-2', title: 'Drafts', marker: { kind: 'cloud', label: 'Cohub' },
            capabilities: { browse: true, read: true, write: true },
          },
        ],
      }],
    })
    unregister()
    source.dispose()
    expect(ctx.remoteRoots.snapshot.getSnapshot().sources).toEqual([])
    await ctx.fiber.dispose()
  })

  it('maps opaque identities without turning Space paths into local paths', async () => {
    const listDirectory = vi.fn(async (spaceId: string, path: string) => ({
      spaceId,
      path,
      entries: [
        { path: 'wiki/characters', name: 'characters', kind: 'folder' as const, size: 0, revision: '10:0' },
        { path: 'wiki/index.md', name: 'index.md', kind: 'file' as const, size: 12, revision: '11:12' },
        { path: 'wiki/latest', name: 'latest', kind: 'link' as const, size: 8, revision: '12:8' },
      ],
    }))
    const api = remote({
      listDirectory,
    })
    const source = new CohubSpacesRemoteRootSource(api)
    const rootId = 'space-1' as RemoteResourceId
    const wikiId = JSON.stringify(['space-1', 'wiki']) as RemoteResourceId
    const listing = await source.list({ rootId, parentId: wikiId })

    expect(listDirectory).toHaveBeenCalledWith('space-1', 'wiki')
    expect(listing).toEqual({
      rootId,
      parentId: wikiId,
      entries: [
        {
          id: JSON.stringify(['space-1', 'wiki/characters']), parentId: wikiId,
          name: 'characters', kind: 'folder', size: 0, revision: '10:0',
        },
        {
          id: JSON.stringify(['space-1', 'wiki/index.md']), parentId: wikiId,
          name: 'index.md', kind: 'file', size: 12, revision: '11:12',
        },
        {
          id: JSON.stringify(['space-1', 'wiki/latest']), parentId: wikiId,
          name: 'latest', kind: 'link', size: 8, revision: '12:8',
        },
      ],
    })
    expect(JSON.stringify(listing)).not.toContain('/workspace')
    source.dispose()
  })

  it('routes text reads and conflict-preserving writes through the Host adapter', async () => {
    const writeText = vi.fn(async (spaceId: string, path: string) => ({
      ok: false as const,
      error: {
        code: 'version-conflict' as const,
        current: { spaceId, path, content: 'current', revision: '21:7' },
      },
    }))
    const api = remote({
      readText: vi.fn(async (spaceId: string, path: string) => ({
        spaceId, path, content: 'hello', revision: '20:5',
      })),
      writeText,
    })
    const source = new CohubSpacesRemoteRootSource(api)
    const rootId = 'space-1' as RemoteResourceId
    const fileId = JSON.stringify(['space-1', 'wiki/index.md']) as RemoteResourceId

    await expect(source.read({ rootId, fileId })).resolves.toEqual({
      rootId, fileId, content: 'hello', revision: '20:5',
    })
    await expect(source.write({
      rootId, fileId, content: 'mine', ifRevision: '20:5',
    })).resolves.toEqual({
      ok: false,
      error: { code: 'version-conflict', current: { rootId, fileId, content: 'current', revision: '21:7' } },
    })
    expect(writeText).toHaveBeenCalledWith('space-1', 'wiki/index.md', 'mine', '20:5')
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
    let resolve!: (value: { spaceId: string; path: string; content: string; revision: string }) => void
    const api = remote({
      readText: vi.fn(() => new Promise<{ spaceId: string; path: string; content: string; revision: string }>(
        (done) => { resolve = done },
      )),
    })
    const source = new CohubSpacesRemoteRootSource(api)
    const controller = new AbortController()
    const rootId = 'space-1' as RemoteResourceId
    const fileId = JSON.stringify(['space-1', 'wiki/index.md']) as RemoteResourceId
    const pending = source.read({ rootId, fileId, signal: controller.signal })
    controller.abort(new Error('closed editor'))
    await expect(pending).rejects.toThrow('closed editor')
    resolve({ spaceId: 'space-1', path: 'wiki/index.md', content: 'late', revision: '1:4' })
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
          listDirectory: vi.fn(),
          readText: vi.fn(),
          writeText: vi.fn(),
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
