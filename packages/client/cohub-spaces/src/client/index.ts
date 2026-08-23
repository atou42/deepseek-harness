/** Cohub provider for the generic browser-side remote-root seam. */

import type { ClientContext, ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CohubAbortTurnResult, CohubAccountSnapshot, CohubConversationView, CohubPromptSubmission,
  CohubSpaceSessionList,
  CohubSpaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  RemoteConversationView, RemoteDirectoryListing,
  RemoteResourceId,
  RemoteRootSource,
  RemoteRootSourceId,
  RemoteRootSourceSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-remote-roots/client'

/** Stable provider identity used by the remote-root registry. */
export const COHUB_SPACES_SOURCE_ID = 'cohub.spaces' as RemoteRootSourceId

/** Token-free browser facade for Cohub account, Space, and Session reads. */
export interface CohubSpacesRemoteApi {
  getAccount(): Promise<CohubAccountSnapshot>
  listSpaces(): Promise<readonly CohubSpaceView[]>
  listSessions(spaceId: string): Promise<CohubSpaceSessionList>
  getConversation(spaceId: string, sessionId: string): Promise<CohubConversationView>
  sendPrompt(spaceId: string, sessionId: string | null, content: string, clientMessageId: string): Promise<CohubPromptSubmission>
  abortTurn(spaceId: string, sessionId: string, turnId: string): Promise<CohubAbortTurnResult>
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

function sessionId(rootId: RemoteResourceId, value: RemoteResourceId): string {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch (error) {
    throw new TypeError('client-cohub-spaces: Session identity is malformed', { cause: error })
  }
  if (!Array.isArray(parsed) || parsed.length !== 2 || parsed[0] !== rootId
    || typeof parsed[1] !== 'string' || parsed[1].trim().length === 0) {
    throw new TypeError('client-cohub-spaces: Session identity does not match the requested Space')
  }
  return parsed[1]
}

function turnResourceId(spaceId: string, sessionId: string, turnId: string): RemoteResourceId {
  return JSON.stringify([spaceId, sessionId, turnId]) as RemoteResourceId
}

function turnId(rootId: RemoteResourceId, sessionResourceId: RemoteResourceId, value: RemoteResourceId): string {
  const rawSessionId = sessionId(rootId, sessionResourceId)
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch (error) {
    throw new TypeError('client-cohub-spaces: Turn identity is malformed', { cause: error })
  }
  if (!Array.isArray(parsed) || parsed.length !== 3 || parsed[0] !== rootId || parsed[1] !== rawSessionId
    || typeof parsed[2] !== 'string' || parsed[2].trim().length === 0) {
    throw new TypeError('client-cohub-spaces: Turn identity does not match the requested Cohub Session')
  }
  return parsed[2]
}

function sessionDisplayName(session: { readonly id: string; readonly title: string; readonly latestMessageText?: string }): string {
  if (session.title.trim().length > 0) return session.title
  if (session.latestMessageText?.trim().length) return session.latestMessageText.trim().slice(0, 80)
  return `Session ${session.id.slice(0, 8)}`
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

  constructor(
    private readonly remote: CohubSpacesRemoteApi,
    private readonly startDshSession: (spaceId: string) => Promise<void>,
  ) {}

  /** Reload account state and the accessible Space roots. */
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
          capabilities: Object.freeze({
            browse: true as const, read: false, write: false, workspace: true, conversation: 'interactive' as const,
          }),
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
        name: sessionDisplayName(session),
        kind: 'session' as const,
        revision: session.updatedAt,
      }))),
    })
  }

  async readConversation(request: {
    readonly rootId: RemoteResourceId
    readonly sessionId?: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationView> {
    if (request.sessionId === undefined) {
      return Object.freeze({ rootId: request.rootId, turns: Object.freeze([]) })
    }
    const rawSessionId = sessionId(request.rootId, request.sessionId)
    const value = await abortable(this.remote.getConversation(request.rootId, rawSessionId), request.signal)
    if (value.spaceId !== request.rootId || value.session.id !== rawSessionId) {
      throw new TypeError('client-cohub-spaces: conversation does not match the requested Session')
    }
    return Object.freeze({
      rootId: request.rootId,
      session: Object.freeze({
        id: request.sessionId,
        title: sessionDisplayName(value.session),
        status: value.session.status,
      }),
      turns: Object.freeze(value.turns.map(turn => Object.freeze({
        id: turnResourceId(value.spaceId, rawSessionId, turn.id),
        sequence: turn.sequence,
        status: turn.status,
        ...turn.userText === undefined ? {} : { userText: turn.userText },
        ...turn.assistantText === undefined ? {} : { assistantText: turn.assistantText },
        ...turn.errorMessage === undefined ? {} : { errorMessage: turn.errorMessage },
        updatedAt: turn.updatedAt,
      }))),
    })
  }

  async startWorkspace(request: {
    readonly rootId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<void> {
    await abortable(this.startDshSession(request.rootId), request.signal)
  }

  async sendConversationMessage(request: {
    readonly rootId: RemoteResourceId
    readonly sessionId?: RemoteResourceId
    readonly content: string
    readonly clientMessageId: string
    readonly signal?: AbortSignal
  }) {
    const rawSessionId = request.sessionId === undefined ? null : sessionId(request.rootId, request.sessionId)
    const value = await abortable(
      this.remote.sendPrompt(request.rootId, rawSessionId, request.content, request.clientMessageId),
      request.signal,
    )
    if (value.spaceId !== request.rootId || (rawSessionId !== null && value.session.id !== rawSessionId)) {
      throw new TypeError('client-cohub-spaces: prompt result does not match the requested Cohub Session')
    }
    const opaqueSessionId = resourceId(value.spaceId, value.session.id)
    return Object.freeze({
      rootId: request.rootId,
      session: Object.freeze({
        id: opaqueSessionId,
        title: sessionDisplayName(value.session),
        status: value.session.status,
      }),
      turn: Object.freeze({
        id: turnResourceId(value.spaceId, value.session.id, value.turn.id),
        sequence: value.turn.sequence,
        status: value.turn.status,
        ...value.turn.userText === undefined ? {} : { userText: value.turn.userText },
        ...value.turn.assistantText === undefined ? {} : { assistantText: value.turn.assistantText },
        ...value.turn.errorMessage === undefined ? {} : { errorMessage: value.turn.errorMessage },
        updatedAt: value.turn.updatedAt,
      }),
    })
  }

  async abortConversationTurn(request: {
    readonly rootId: RemoteResourceId
    readonly sessionId: RemoteResourceId
    readonly turnId: RemoteResourceId
    readonly signal?: AbortSignal
  }) {
    const rawSessionId = sessionId(request.rootId, request.sessionId)
    const rawTurnId = turnId(request.rootId, request.sessionId, request.turnId)
    const value = await abortable(
      this.remote.abortTurn(request.rootId, rawSessionId, rawTurnId),
      request.signal,
    )
    if (value.spaceId !== request.rootId || value.sessionId !== rawSessionId || value.turnId !== rawTurnId) {
      throw new TypeError('client-cohub-spaces: abort result does not match the requested Cohub Turn')
    }
    return Object.freeze({
      ok: true as const,
      rootId: request.rootId,
      sessionId: request.sessionId,
      turnId: request.turnId,
    })
  }

  /** Stop publishing snapshots and release local listeners. */
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

export const inject = ['remote', 'remote.cohubAccount', 'remote.cohubSpaces', 'remoteRoots', 'sessions', 'workspaces']

/** Register the Cohub source and refresh it whenever the Host account changes. */
export function apply(ctx: ClientContext): () => void {
  const carrier = ctx.remote.cohubSpaces as typeof ctx.remote.cohubSpaces & {
    sendPrompt(
      spaceId: string,
      sessionId: string | null,
      content: string,
      clientMessageId: string,
    ): Promise<RemoteAnswer<CohubPromptSubmission>>
    abortTurn(spaceId: string, sessionId: string, turnId: string): Promise<RemoteAnswer<CohubAbortTurnResult>>
  }
  const accountCarrier = ctx.remote.cohubAccount
  const source = new CohubSpacesRemoteRootSource({
    getAccount: async () => unwrapRemote('cohubAccount.getAccount', await accountCarrier.getAccount()),
    listSpaces: async () => unwrapRemote('cohubSpaces.listSpaces', await carrier.listSpaces()),
    listSessions: async spaceId =>
      unwrapRemote('cohubSpaces.listSessions', await carrier.listSessions(spaceId)),
    getConversation: async (spaceId, sessionId) =>
      unwrapRemote('cohubSpaces.getConversation', await carrier.getConversation(spaceId, sessionId)),
    sendPrompt: async (spaceId, sessionId, content, clientMessageId) =>
      unwrapRemote('cohubSpaces.sendPrompt', await carrier.sendPrompt(spaceId, sessionId, content, clientMessageId)),
    abortTurn: async (spaceId, sessionId, turnId) =>
      unwrapRemote('cohubSpaces.abortTurn', await carrier.abortTurn(spaceId, sessionId, turnId)),
  }, async (spaceId) => {
    const start = unwrapRemote('cohubSpaces.getDshSessionStart', await carrier.getDshSessionStart(spaceId))
    if (start.spaceId !== spaceId || typeof start.cwd !== 'string' || start.cwd.trim().length === 0) {
      throw new TypeError('client-cohub-spaces: DSH Session start context does not match the requested Space')
    }
    const workspace = await ctx.workspaces.create({ path: start.cwd })
    const sessionId = await ctx.sessions.create({ workspaceId: workspace.workspaceId })
    unwrapRemote('cohubSpaces.bindDshSession', await carrier.bindDshSession(spaceId, sessionId))
    ctx.sessions.open(sessionId)
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
