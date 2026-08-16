import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {
  RemoteDirectoryListing, RemoteResourceId, RemoteRootSource, RemoteRootSourceId,
  RemoteRootSourceSnapshot, RemoteRootsSnapshot, RemoteTextFile, RemoteTextWriteResult,
} from '../types.ts'
import type { RemoteRootsServiceContract } from './contract.ts'

interface RegisteredSource {
  readonly source: RemoteRootSource
  readonly unsubscribe: () => void
}

const SOURCE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/

function nonBlank(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`remote-roots: ${field} must be a non-blank string`)
  }
  return value
}

function validateSnapshot(sourceId: string, snapshot: RemoteRootSourceSnapshot): RemoteRootSourceSnapshot {
  if (snapshot.status === 'loading') {
    if (snapshot.roots.length !== 0) throw new TypeError(`remote-roots: loading source "${sourceId}" published roots`)
    return snapshot
  }
  if (snapshot.status === 'error') {
    if (snapshot.roots.length !== 0) throw new TypeError(`remote-roots: failed source "${sourceId}" published roots`)
    nonBlank(snapshot.message, `source "${sourceId}" error message`)
    return snapshot
  }
  const ids = new Set<string>()
  for (const root of snapshot.roots) {
    nonBlank(root.id, `source "${sourceId}" root id`)
    nonBlank(root.title, `source "${sourceId}" root title`)
    nonBlank(root.marker.label, `source "${sourceId}" marker label`)
    if (ids.has(root.id)) throw new Error(`remote-roots: source "${sourceId}" published duplicate root "${root.id}"`)
    ids.add(root.id)
  }
  return snapshot
}

/** Client registry that aggregates independently unloadable remote-root sources. */
export class RemoteRootsService extends Service implements RemoteRootsServiceContract {
  private readonly sources = new Map<RemoteRootSourceId, RegisteredSource>()
  private readonly listeners = new Set<() => void>()
  private revision = 0
  private current: RemoteRootsSnapshot = Object.freeze({ revision: 0, sources: Object.freeze([]) })
  private currentFailure: { readonly error: unknown } | undefined
  readonly snapshot = {
    getSnapshot: (): RemoteRootsSnapshot => {
      if (this.currentFailure !== undefined) throw this.currentFailure.error
      return this.current
    },
    subscribe: (listener: () => void): (() => void) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  constructor(ctx: Context) {
    super(ctx, 'remoteRoots')
  }

  register(source: RemoteRootSource): () => void {
    if (!SOURCE_ID.test(source.id)) {
      throw new TypeError(`remote-roots: invalid source id "${String(source.id)}"`)
    }
    if (this.sources.has(source.id)) throw new Error(`remote-roots: source "${source.id}" is already registered`)
    validateSnapshot(source.id, source.snapshot.getSnapshot())
    let active = true
    const unsubscribe = source.snapshot.subscribe(() => {
      if (active) this.publish()
    })
    this.sources.set(source.id, { source, unsubscribe })
    try {
      this.publish()
    } catch (error) {
      this.sources.delete(source.id)
      active = false
      unsubscribe()
      throw error
    }
    return () => {
      if (!active) return
      active = false
      const current = this.sources.get(source.id)
      if (current?.source !== source) return
      this.sources.delete(source.id)
      current.unsubscribe()
      this.publish()
    }
  }

  async list(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly parentId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteDirectoryListing> {
    return this.requireSource(sourceId).list(request)
  }

  async read(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteTextFile> {
    const source = this.requireSource(sourceId)
    if (source.read === undefined) throw new Error(`remote-roots: source "${sourceId}" does not support reading`)
    return source.read(request)
  }

  async write(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly content: string
    readonly ifRevision: string
    readonly signal?: AbortSignal
  }): Promise<RemoteTextWriteResult> {
    const source = this.requireSource(sourceId)
    if (source.write === undefined) throw new Error(`remote-roots: source "${sourceId}" does not support writing`)
    return source.write(request)
  }

  private requireSource(sourceId: RemoteRootSourceId): RemoteRootSource {
    const source = this.sources.get(sourceId)?.source
    if (source === undefined) throw new Error(`remote-roots: unknown source "${sourceId}"`)
    return source
  }

  private publish(): void {
    try {
      const sources = [...this.sources.values()].map(({ source }) => {
        const current = validateSnapshot(source.id, source.snapshot.getSnapshot())
        return Object.freeze({
          sourceId: source.id,
          status: current.status,
          roots: current.roots,
          ...(current.status === 'error' ? { message: current.message } : {}),
        })
      })
      Object.freeze(sources)
      this.revision++
      this.current = Object.freeze({ revision: this.revision, sources })
      this.currentFailure = undefined
    } catch (error) {
      this.currentFailure = { error }
      for (const listener of [...this.listeners]) listener()
      throw error
    }
    for (const listener of [...this.listeners]) listener()
  }
}
