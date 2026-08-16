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
const MARKER_KINDS = new Set(['cloud', 'network', 'external'])

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`remote-roots: ${field} must be a non-blank string`)
  }
  return value
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`remote-roots: ${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function emptyRoots(value: unknown, field: string): readonly [] {
  if (!Array.isArray(value) || value.length !== 0) {
    throw new TypeError(`remote-roots: ${field} published roots`)
  }
  return Object.freeze([])
}

function cloneRoot(sourceId: string, value: unknown): RemoteRootsSnapshot['sources'][number]['roots'][number] {
  const root = record(value, `source "${sourceId}" root`)
  const marker = record(root.marker, `source "${sourceId}" marker`)
  const capabilities = record(root.capabilities, `source "${sourceId}" capabilities`)
  const kind = nonBlank(marker.kind, `source "${sourceId}" marker kind`)
  if (!MARKER_KINDS.has(kind)) throw new TypeError(`remote-roots: source "${sourceId}" has invalid marker kind "${kind}"`)
  if (capabilities.browse !== true) throw new TypeError(`remote-roots: source "${sourceId}" capability browse must be true`)
  if (typeof capabilities.read !== 'boolean') throw new TypeError(`remote-roots: source "${sourceId}" capability read must be a boolean`)
  if (typeof capabilities.write !== 'boolean') throw new TypeError(`remote-roots: source "${sourceId}" capability write must be a boolean`)
  return Object.freeze({
    id: nonBlank(root.id, `source "${sourceId}" root id`) as RemoteResourceId,
    title: nonBlank(root.title, `source "${sourceId}" root title`),
    marker: Object.freeze({
      kind: kind as 'cloud' | 'network' | 'external',
      label: nonBlank(marker.label, `source "${sourceId}" marker label`),
    }),
    capabilities: Object.freeze({
      browse: true,
      read: capabilities.read,
      write: capabilities.write,
    }),
  })
}

function validateSnapshot(sourceId: string, value: unknown): RemoteRootSourceSnapshot {
  const snapshot = record(value, `source "${sourceId}" snapshot`)
  if (snapshot.status === 'loading') {
    return Object.freeze({ status: 'loading', roots: emptyRoots(snapshot.roots, `loading source "${sourceId}"`) })
  }
  if (snapshot.status === 'authentication-required') {
    return Object.freeze({
      status: 'authentication-required',
      roots: emptyRoots(snapshot.roots, `authentication-required source "${sourceId}"`),
      provider: nonBlank(snapshot.provider, `source "${sourceId}" authentication provider`),
    })
  }
  if (snapshot.status === 'error') {
    return Object.freeze({
      status: 'error',
      roots: emptyRoots(snapshot.roots, `failed source "${sourceId}"`),
      message: nonBlank(snapshot.message, `source "${sourceId}" error message`),
    })
  }
  if (snapshot.status !== 'ready') throw new TypeError(`remote-roots: source "${sourceId}" has invalid status`)
  if (!Array.isArray(snapshot.roots)) throw new TypeError(`remote-roots: source "${sourceId}" roots must be an array`)
  const ids = new Set<string>()
  const roots = snapshot.roots.map((value) => {
    const root = cloneRoot(sourceId, value)
    if (ids.has(root.id)) throw new Error(`remote-roots: source "${sourceId}" published duplicate root "${root.id}"`)
    ids.add(root.id)
    return root
  })
  return Object.freeze({ status: 'ready', roots: Object.freeze(roots) })
}

function validateListing(value: unknown, request: {
  readonly rootId: RemoteResourceId
  readonly parentId: RemoteResourceId
}): RemoteDirectoryListing {
  const listing = record(value, 'list result')
  if (listing.rootId !== request.rootId) throw new TypeError('remote-roots: list result rootId does not match request')
  if (listing.parentId !== request.parentId) throw new TypeError('remote-roots: list result parentId does not match request')
  if (!Array.isArray(listing.entries)) throw new TypeError('remote-roots: list result entries must be an array')
  const ids = new Set<string>()
  const entries = listing.entries.map((value, index) => {
    const entry = record(value, `list entry ${index}`)
    const id = nonBlank(entry.id, `list entry ${index} id`) as RemoteResourceId
    if (ids.has(id)) throw new TypeError(`remote-roots: list result contains duplicate entry "${id}"`)
    ids.add(id)
    if (entry.parentId !== request.parentId) throw new TypeError(`remote-roots: list entry "${id}" parentId does not match request`)
    if (entry.kind !== 'folder' && entry.kind !== 'file' && entry.kind !== 'link') throw new TypeError(`remote-roots: list entry "${id}" has invalid kind`)
    if (entry.revision !== undefined) nonBlank(entry.revision, `list entry "${id}" revision`)
    if (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0)) {
      throw new TypeError(`remote-roots: list entry "${id}" size must be a non-negative safe integer`)
    }
    return Object.freeze({
      id,
      parentId: request.parentId,
      name: nonBlank(entry.name, `list entry "${id}" name`),
      kind: entry.kind,
      ...(entry.revision === undefined ? {} : { revision: entry.revision as string }),
      ...(entry.size === undefined ? {} : { size: entry.size as number }),
    })
  })
  return Object.freeze({ rootId: request.rootId, parentId: request.parentId, entries: Object.freeze(entries) })
}

function validateTextFile(value: unknown, request: {
  readonly rootId: RemoteResourceId
  readonly fileId: RemoteResourceId
}, field: string): RemoteTextFile {
  const file = record(value, field)
  if (file.rootId !== request.rootId) throw new TypeError(`remote-roots: ${field} rootId does not match request`)
  if (file.fileId !== request.fileId) throw new TypeError(`remote-roots: ${field} fileId does not match request`)
  if (typeof file.content !== 'string') throw new TypeError(`remote-roots: ${field} content must be a string`)
  return Object.freeze({
    rootId: request.rootId,
    fileId: request.fileId,
    content: file.content,
    revision: nonBlank(file.revision, `${field} revision`),
  })
}

function validateWriteResult(value: unknown, request: {
  readonly rootId: RemoteResourceId
  readonly fileId: RemoteResourceId
}): RemoteTextWriteResult {
  const result = record(value, 'write result')
  if (result.ok === true) {
    return Object.freeze({ ok: true, value: validateTextFile(result.value, request, 'write result value') })
  }
  if (result.ok !== false) throw new TypeError('remote-roots: write result ok must be a boolean')
  const error = record(result.error, 'write result error')
  if (error.code !== 'version-conflict') throw new TypeError('remote-roots: write result has unsupported error code')
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: 'version-conflict',
      current: validateTextFile(error.current, request, 'write conflict current'),
    }),
  })
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
    nonBlank(request.rootId, 'list request rootId')
    nonBlank(request.parentId, 'list request parentId')
    return validateListing(await this.requireSource(sourceId).list(request), request)
  }

  async read(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteTextFile> {
    nonBlank(request.rootId, 'read request rootId')
    nonBlank(request.fileId, 'read request fileId')
    const source = this.requireSource(sourceId)
    if (source.read === undefined) throw new Error(`remote-roots: source "${sourceId}" does not support reading`)
    return validateTextFile(await source.read(request), request, 'read result')
  }

  async write(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly content: string
    readonly ifRevision: string
    readonly signal?: AbortSignal
  }): Promise<RemoteTextWriteResult> {
    nonBlank(request.rootId, 'write request rootId')
    nonBlank(request.fileId, 'write request fileId')
    if (typeof request.content !== 'string') throw new TypeError('remote-roots: write request content must be a string')
    nonBlank(request.ifRevision, 'write request ifRevision')
    const source = this.requireSource(sourceId)
    if (source.write === undefined) throw new Error(`remote-roots: source "${sourceId}" does not support writing`)
    return validateWriteResult(await source.write(request), request)
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
          ...(current.status === 'authentication-required' ? { provider: current.provider } : {}),
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
