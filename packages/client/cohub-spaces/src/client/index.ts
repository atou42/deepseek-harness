/** Cohub provider for the generic browser-side remote-root seam. */

import type { ClientContext, ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CohubAccountSnapshot,
  CohubSpaceSessionList,
  CohubSpaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  RemoteDirectoryListing,
  RemoteResourceId,
  RemoteRootSource,
  RemoteRootSourceId,
  RemoteRootSourceSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-remote-roots/client'

export const COHUB_SPACES_SOURCE_ID = 'cohub.spaces' as RemoteRootSourceId

export interface CohubSpacesRemoteApi {
  getAccount(): Promise<CohubAccountSnapshot>
  listSpaces(): Promise<readonly CohubSpaceView[]>
  listSessions(spaceId: string): Promise<CohubSpaceSessionList>
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
          capabilities: Object.freeze({ browse: true as const, read: false, write: false }),
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
    if (request.parentId !== request.rootId) throw new TypeError('client-cohub-spaces: Sessions are leaf resources')
    const value = await abortable(this.remote.listSessions(request.rootId), request.signal)
    if (value.spaceId !== request.rootId) throw new TypeError('client-cohub-spaces: Session list does not match the requested Space')
    return Object.freeze({
      rootId: request.rootId,
      parentId: request.parentId,
      entries: Object.freeze(value.sessions.map(session => Object.freeze({
        id: resourceId(value.spaceId, session.id),
        parentId: request.parentId,
        name: session.title,
        kind: 'session' as const,
        revision: session.updatedAt,
      }))),
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
    listSessions: async spaceId =>
      unwrapRemote('cohubSpaces.listSessions', await carrier.listSessions(spaceId)),
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
