/** Cohub provider for the generic browser-side remote-root seam. */

import type { ClientContext, ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CohubAccountSnapshot,
  CohubSpaceDirectory,
  CohubSpaceTextFile,
  CohubSpaceView,
  CohubSpaceWriteResult,
} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  RemoteDirectoryListing,
  RemoteResourceId,
  RemoteRootSource,
  RemoteRootSourceId,
  RemoteRootSourceSnapshot,
  RemoteTextFile,
  RemoteTextWriteResult,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-remote-roots/client'

export const COHUB_SPACES_SOURCE_ID = 'cohub.spaces' as RemoteRootSourceId

export interface CohubSpacesRemoteApi {
  getAccount(): Promise<CohubAccountSnapshot>
  listSpaces(): Promise<readonly CohubSpaceView[]>
  listDirectory(spaceId: string, path: string): Promise<CohubSpaceDirectory>
  readText(spaceId: string, path: string): Promise<CohubSpaceTextFile>
  writeText(spaceId: string, path: string, content: string, ifRevision: string): Promise<CohubSpaceWriteResult>
}

type RemoteAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

const EMPTY_ROOTS: readonly [] = Object.freeze([])

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rejection(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  return new Error(fallback, { cause: error })
}

function unwrapRemote<T>(operation: string, answer: RemoteAnswer<T>): T {
  if (answer.ok) return answer.value
  throw new Error(`${operation} failed: ${answer.error.code}: ${answer.error.message}`)
}

function resourceId(spaceId: string, path: string): RemoteResourceId {
  return JSON.stringify([spaceId, path]) as RemoteResourceId
}

function resourcePath(rootId: RemoteResourceId, id: RemoteResourceId): string {
  if (id === rootId) return ''
  let value: unknown
  try {
    value = JSON.parse(id)
  } catch (error) {
    throw new TypeError('client-cohub-spaces: malformed remote resource id', { cause: error })
  }
  if (!Array.isArray(value) || value.length !== 2 || value[0] !== rootId || typeof value[1] !== 'string') {
    throw new TypeError('client-cohub-spaces: remote resource id does not belong to the requested Space')
  }
  return value[1]
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return promise
  if (signal.aborted) return Promise.reject(rejection(signal.reason, 'client-cohub-spaces: operation aborted'))
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => { reject(rejection(signal.reason, 'client-cohub-spaces: operation aborted')) }
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(rejection(error, 'client-cohub-spaces: Remote operation failed'))
      },
    )
  })
}

function mapTextFile(rootId: RemoteResourceId, fileId: RemoteResourceId, value: CohubSpaceTextFile): RemoteTextFile {
  if (value.spaceId !== rootId || value.path !== resourcePath(rootId, fileId)) {
    throw new TypeError('client-cohub-spaces: file response does not match the requested resource')
  }
  return Object.freeze({ rootId, fileId, content: value.content, revision: value.revision })
}

/** Independently disposable Cohub source. It owns no account or credential state. */
export class CohubSpacesRemoteRootSource implements RemoteRootSource {
  readonly id = COHUB_SPACES_SOURCE_ID
  private readonly listeners = new Set<() => void>()
  private current: RemoteRootSourceSnapshot = Object.freeze({ status: 'loading', roots: EMPTY_ROOTS })
  private generation = 0
  private closed = false

  readonly snapshot: ObservableSnapshot<RemoteRootSourceSnapshot> = {
    getSnapshot: () => this.current,
    subscribe: (listener) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  constructor(private readonly remote: CohubSpacesRemoteApi) {}

  async refresh(): Promise<void> {
    if (this.closed) return
    const generation = ++this.generation
    this.publish(Object.freeze({ status: 'loading', roots: EMPTY_ROOTS }))
    try {
      const account = await this.remote.getAccount()
      if (generation !== this.generation) return
      if (account.status !== 'authenticated') {
        this.publish(Object.freeze({
          status: 'authentication-required', roots: EMPTY_ROOTS, provider: 'Cohub',
        }))
        return
      }
      const spaces = await this.remote.listSpaces()
      if (generation !== this.generation) return
      const ids = new Set<string>()
      const roots = spaces.map((space, index) => {
        if (typeof space.id !== 'string' || space.id.trim().length === 0) {
          throw new TypeError(`client-cohub-spaces: Space ${String(index)} has an invalid id`)
        }
        if (ids.has(space.id)) throw new TypeError(`client-cohub-spaces: duplicate Space id "${space.id}"`)
        ids.add(space.id)
        if (typeof space.title !== 'string' || space.title.trim().length === 0) {
          throw new TypeError(`client-cohub-spaces: Space "${space.id}" has an invalid title`)
        }
        return Object.freeze({
          id: space.id as RemoteResourceId,
          title: space.title,
          marker: Object.freeze({ kind: 'cloud' as const, label: 'Cohub' }),
          capabilities: Object.freeze({ browse: true as const, read: true, write: true }),
        })
      })
      this.publish(Object.freeze({ status: 'ready', roots: Object.freeze(roots) }))
    } catch (error) {
      if (generation !== this.generation) return
      this.publish(Object.freeze({ status: 'error', roots: EMPTY_ROOTS, message: message(error) }))
    }
  }

  async list(request: {
    readonly rootId: RemoteResourceId
    readonly parentId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteDirectoryListing> {
    const path = resourcePath(request.rootId, request.parentId)
    const value = await abortable(this.remote.listDirectory(request.rootId, path), request.signal)
    if (value.spaceId !== request.rootId || value.path !== path) {
      throw new TypeError('client-cohub-spaces: directory response does not match the requested resource')
    }
    return Object.freeze({
      rootId: request.rootId,
      parentId: request.parentId,
      entries: Object.freeze(value.entries.map(entry => Object.freeze({
        id: resourceId(value.spaceId, entry.path),
        parentId: request.parentId,
        name: entry.name,
        kind: entry.kind,
        revision: entry.revision,
        size: entry.size,
      }))),
    })
  }

  async read(request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteTextFile> {
    const path = resourcePath(request.rootId, request.fileId)
    const value = await abortable(this.remote.readText(request.rootId, path), request.signal)
    return mapTextFile(request.rootId, request.fileId, value)
  }

  async write(request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly content: string
    readonly ifRevision: string
    readonly signal?: AbortSignal
  }): Promise<RemoteTextWriteResult> {
    const path = resourcePath(request.rootId, request.fileId)
    const result = await abortable(
      this.remote.writeText(request.rootId, path, request.content, request.ifRevision),
      request.signal,
    )
    if (result.ok) {
      return Object.freeze({ ok: true, value: mapTextFile(request.rootId, request.fileId, result.value) })
    }
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: 'version-conflict',
        current: mapTextFile(request.rootId, request.fileId, result.error.current),
      }),
    })
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    this.generation++
    this.listeners.clear()
  }

  private publish(snapshot: RemoteRootSourceSnapshot): void {
    this.current = snapshot
    for (const listener of [...this.listeners]) listener()
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteRoots: import('@deepseek-ai/dsh-client-remote-roots/client').RemoteRootsServiceContract
  }
}

export const inject = ['remote', 'remote.cohubAccount', 'remote.cohubSpaces', 'remoteRoots']

/** Register the Cohub source and refresh it whenever the Host account changes. */
export function apply(ctx: ClientContext): () => void {
  const carrier = ctx.remote.cohubSpaces
  const accountCarrier = ctx.remote.cohubAccount
  const source = new CohubSpacesRemoteRootSource({
    getAccount: async () => unwrapRemote('cohubAccount.getAccount', await accountCarrier.getAccount()),
    listSpaces: async () => unwrapRemote('cohubSpaces.listSpaces', await carrier.listSpaces()),
    listDirectory: async (spaceId, path) =>
      unwrapRemote('cohubSpaces.listDirectory', await carrier.listDirectory(spaceId, path)),
    readText: async (spaceId, path) =>
      unwrapRemote('cohubSpaces.readText', await carrier.readText(spaceId, path)),
    writeText: async (spaceId, path, content, ifRevision) =>
      unwrapRemote('cohubSpaces.writeText', await carrier.writeText(spaceId, path, content, ifRevision)),
  })
  const unregister = ctx.remoteRoots.register(source)
  let off: (() => void) | undefined
  try {
    off = ctx.remote.$on('cohub-spaces/changed', () => { void source.refresh() })
  } catch (error) {
    unregister()
    source.dispose()
    throw error
  }
  void source.refresh()
  return () => {
    off()
    unregister()
    source.dispose()
  }
}
