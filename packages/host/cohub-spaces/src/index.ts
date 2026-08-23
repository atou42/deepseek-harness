/** Host-side Cohub Space/files adapter. */

import { Context, Service } from '@deepseek-ai/cordis'
import { isAbsolute } from 'node:path'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import {
  DEFAULT_COHUB_API_BASE_URL,
  type CohubAccountService,
} from '@deepseek-ai/dsh-cohub-account'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CohubSpaceDirectory,
  CohubDshSessionBinding,
  CohubDshSessionStart,
  CohubConversationView,
  CohubSpaceEntry,
  CohubSpaceSessionList,
  CohubSpaceTextFile,
  CohubSpaceView,
  CohubSpaceWriteResult,
  CohubAbortTurnResult,
  CohubPromptSubmission,
  CohubSessionView,
  CohubTurnView,
} from './types.ts'

export type * from './types.ts'

/** Runtime settings for the Cohub Space Host adapter. */
export interface Config {
  /** Cohub HTTP API origin. */
  apiBaseUrl?: string
  /** Absolute local directory used to anchor Cohub-bound DSH Sessions. */
  localCwd?: string
  /** Delay between command-task status polls. */
  runPollIntervalMs?: number
  /** Maximum time to wait for one Cohub command task. */
  runTimeoutMs?: number
}

interface JsonResponse {
  readonly response: Response
  readonly data: unknown
}

interface ExpectedRevision {
  readonly mtimeMs: number
  readonly size: number
}

interface SpaceBinding {
  readonly spaceId: string
  readonly spaceTitle: string
}

interface CohubRunResult {
  readonly output: string
  readonly durationMs: number
  readonly truncated: boolean
  readonly exitCode?: number
  readonly termination?: string
}

const BINDING_PLUGIN = 'cohub-space'
const BINDING_PREFIX = 'Cohub workspace binding: '

function bindingText(binding: SpaceBinding): string {
  return `${BINDING_PREFIX}${JSON.stringify(binding)}\nThis DSH Session can use its ordinary local tools and the bound Cohub Space tools together. Cohub paths are relative to the Space root.`
}

function disposeStack(disposers: (() => void)[]): () => void {
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const unregister of disposers.reverse()) unregister()
  }
}

function parseBindingText(value: string): SpaceBinding | undefined {
  const firstLine = value.split('\n', 1)[0]
  if (!firstLine?.startsWith(BINDING_PREFIX)) return undefined
  const parsed = record(JSON.parse(firstLine.slice(BINDING_PREFIX.length)), 'persisted Cohub binding')
  return Object.freeze({
    spaceId: nonBlank(parsed.spaceId, 'persisted Cohub binding spaceId'),
    spaceTitle: nonBlank(parsed.spaceTitle, 'persisted Cohub binding spaceTitle'),
  })
}

function waitForPoll(ms: number, signal: AbortSignal): Promise<void> {
  const reason = (): Error => signal.reason instanceof Error
    ? signal.reason
    : new Error('cohub-spaces: polling aborted', { cause: signal.reason })
  if (signal.aborted) return Promise.reject(reason())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms)
    function done(): void {
      signal.removeEventListener('abort', aborted)
      resolve()
    }
    function aborted(): void {
      clearTimeout(timer)
      reject(reason())
    }
    signal.addEventListener('abort', aborted, { once: true })
  })
}

/** A Cohub API request failed without exposing authorization material. */
export class CohubSpacesHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(`cohub-spaces: HTTP ${String(status)}: ${message}`)
    this.name = 'CohubSpacesHttpError'
  }
}

/** A file exists but is not yet available inline. */
export class CohubSpaceFilePreparingError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`cohub-spaces: file is being prepared; retry after ${String(retryAfterMs)}ms`)
    this.name = 'CohubSpaceFilePreparingError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    cohubSpaces: CohubSpacesGateway
    cohubAccount: CohubAccountService
  }
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`cohub-spaces: ${field} must be a non-blank string`)
  }
  return value
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`cohub-spaces: ${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function safeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`cohub-spaces: ${field} must be a non-negative safe integer`)
  }
  return value as number
}

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new TypeError(`cohub-spaces: ${field} must be a non-negative finite safe number`)
  }
  return value
}

function normalizeUrl(value: string): string {
  const parsed = new URL(nonBlank(value, 'apiBaseUrl').replace(/\/+$/, ''))
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('cohub-spaces: apiBaseUrl must use HTTP or HTTPS')
  }
  return parsed.toString().replace(/\/$/, '')
}

function absoluteCwd(value: unknown): string {
  const cwd = nonBlank(value, 'localCwd')
  if (!isAbsolute(cwd)) throw new TypeError('cohub-spaces: localCwd must be an absolute path')
  return cwd
}

function spacePath(value: unknown, field: string, allowEmpty: boolean): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`cohub-spaces: ${field} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`)
  }
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw new TypeError(`cohub-spaces: ${field} must be a relative POSIX path`)
  }
  if (value.length === 0) return value
  const segments = value.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new TypeError(`cohub-spaces: ${field} contains an invalid segment`)
  }
  return value
}

function parentPath(path: string): string {
  const at = path.lastIndexOf('/')
  return at < 0 ? '' : path.slice(0, at)
}

function baseName(path: string): string {
  const at = path.lastIndexOf('/')
  return at < 0 ? path : path.slice(at + 1)
}

function revision(mtimeMs: number, size: number): string {
  return `${String(mtimeMs)}:${String(size)}`
}

function expectedRevision(value: string): ExpectedRevision {
  const match = /^((?:0|[1-9]\d*)(?:\.\d*[1-9])?):(0|[1-9]\d*)$/.exec(nonBlank(value, 'revision'))
  if (match === null) throw new TypeError('cohub-spaces: revision is malformed')
  return {
    mtimeMs: nonNegativeNumber(Number(match[1]), 'revision mtimeMs'),
    size: safeInteger(Number(match[2]), 'revision size'),
  }
}

function spaceTitle(value: Record<string, unknown>, index: number): string {
  for (const field of ['title', 'name', 'slug'] as const) {
    const candidate = value[field]
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }
  throw new TypeError(`cohub-spaces: space ${String(index)} has no displayable title`)
}

function parseSpaces(value: unknown): readonly CohubSpaceView[] {
  if (!Array.isArray(value)) throw new TypeError('cohub-spaces: spaces response must be an array')
  const ids = new Set<string>()
  return Object.freeze(value.map((item, index) => {
    const entry = record(item, `space ${String(index)}`)
    const id = nonBlank(entry.id, `space ${String(index)} id`)
    if (ids.has(id)) throw new TypeError(`cohub-spaces: duplicate space id "${id}"`)
    ids.add(id)
    return Object.freeze({ id, title: spaceTitle(entry, index) })
  }))
}

interface SessionPage {
  readonly sessions: readonly CohubSessionView[]
  readonly hasMore: boolean
  readonly nextCursor?: string
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new TypeError(`cohub-spaces: ${field} must be a string or null`)
  return value
}

function isoInstant(value: unknown, field: string): string {
  const instant = nonBlank(value, field)
  if (!Number.isFinite(Date.parse(instant))) throw new TypeError(`cohub-spaces: ${field} must be an ISO-8601 instant`)
  return instant
}

function parseSession(value: unknown, spaceId: string, field: string): CohubSessionView {
  const session = record(value, field)
  const id = nonBlank(session.id, `${field} id`)
  if (session.spaceId !== spaceId) {
    throw new TypeError(`cohub-spaces: session "${id}" does not belong to Space "${spaceId}"`)
  }
  const latestMessageText = optionalText(session.latestMessageText, `session "${id}" latestMessageText`)
  return Object.freeze({
    id,
    spaceId,
    title: optionalText(session.title, `session "${id}" title`) ?? '',
    status: nonBlank(session.status, `session "${id}" status`),
    ...latestMessageText === undefined ? {} : { latestMessageText },
    updatedAt: isoInstant(session.updatedAt, `session "${id}" updatedAt`),
  })
}

function parseSessionPage(value: unknown, spaceId: string): SessionPage {
  const body = record(value, 'sessions response')
  if (!Array.isArray(body.sessions)) throw new TypeError('cohub-spaces: sessions response sessions must be an array')
  const pageInfo = record(body.pageInfo, 'sessions response pageInfo')
  if (typeof pageInfo.hasMore !== 'boolean') {
    throw new TypeError('cohub-spaces: sessions response pageInfo.hasMore must be a boolean')
  }
  const nextCursor = pageInfo.hasMore
    ? nonBlank(pageInfo.nextCursor, 'sessions response pageInfo.nextCursor')
    : undefined
  const sessions = body.sessions.map((item, index) => {
    return parseSession(item, spaceId, `session ${String(index)}`)
  })
  return Object.freeze({ sessions: Object.freeze(sessions), hasMore: pageInfo.hasMore, ...nextCursor ? { nextCursor } : {} })
}

interface TurnPage {
  readonly session: CohubSessionView
  readonly turns: readonly CohubTurnView[]
  readonly hasMore: boolean
  readonly nextCursor?: string
}

function parseTurn(value: unknown, sessionId: string, field: string): CohubTurnView {
  const turn = record(value, field)
  const id = nonBlank(turn.id, `${field} id`)
  if (turn.sessionId !== sessionId) throw new TypeError(`cohub-spaces: turn "${id}" does not belong to Session "${sessionId}"`)
  const userText = optionalText(turn.userText, `turn "${id}" userText`)
  const assistantText = optionalText(turn.assistantText, `turn "${id}" assistantText`)
  const errorMessage = optionalText(turn.errorMessage, `turn "${id}" errorMessage`)
  return Object.freeze({
    id,
    sessionId,
    sequence: safeInteger(turn.sequence, `turn "${id}" sequence`),
    status: nonBlank(turn.status, `turn "${id}" status`),
    ...userText === undefined ? {} : { userText },
    ...assistantText === undefined ? {} : { assistantText },
    ...errorMessage === undefined ? {} : { errorMessage },
    createdAt: isoInstant(turn.createdAt, `turn "${id}" createdAt`),
    updatedAt: isoInstant(turn.updatedAt, `turn "${id}" updatedAt`),
  })
}

function parseTurnResponse(value: unknown, spaceId: string, sessionId?: string): {
  readonly session: CohubSessionView
  readonly turn: CohubTurnView
} {
  const body = record(value, 'turn response')
  const session = parseSession(body.session, spaceId, 'turn response session')
  if (sessionId !== undefined && session.id !== sessionId) {
    throw new TypeError('cohub-spaces: turn response Session does not match request')
  }
  return Object.freeze({ session, turn: parseTurn(body.turn, session.id, 'turn response turn') })
}

function parseTurnPage(value: unknown, spaceId: string, sessionId: string): TurnPage {
  const body = record(value, 'turns response')
  const session = parseSession(body.session, spaceId, 'turns response session')
  if (session.id !== sessionId) throw new TypeError('cohub-spaces: turns response Session does not match request')
  if (!Array.isArray(body.turns)) throw new TypeError('cohub-spaces: turns response turns must be an array')
  if (typeof body.hasMore !== 'boolean') throw new TypeError('cohub-spaces: turns response hasMore must be a boolean')
  const nextCursor = body.hasMore ? String(safeInteger(body.nextCursor, 'turns response nextCursor')) : undefined
  const turns = body.turns.map((value, index) => parseTurn(value, sessionId, `turn ${String(index)}`))
  return Object.freeze({ session, turns: Object.freeze(turns), hasMore: body.hasMore, ...nextCursor ? { nextCursor } : {} })
}

function parseEntry(value: unknown, requestedPath: string, index: number): CohubSpaceEntry {
  const entry = record(value, `tree entry ${String(index)}`)
  const path = spacePath(entry.path, `tree entry ${String(index)} path`, false)
  if (parentPath(path) !== requestedPath) {
    throw new TypeError(`cohub-spaces: tree entry "${path}" is not an immediate child of "${requestedPath}"`)
  }
  const name = nonBlank(entry.name, `tree entry ${String(index)} name`)
  if (name !== baseName(path)) throw new TypeError(`cohub-spaces: tree entry "${path}" name does not match its path`)
  const type = entry.type
  if (type !== 'dir' && type !== 'file' && type !== 'symlink') {
    throw new TypeError(`cohub-spaces: tree entry "${path}" has invalid type`)
  }
  const size = safeInteger(entry.size, `tree entry "${path}" size`)
  const mtimeMs = nonNegativeNumber(entry.mtimeMs, `tree entry "${path}" mtimeMs`)
  return Object.freeze({
    path,
    name,
    kind: type === 'dir' ? 'folder' : type === 'file' ? 'file' : 'link',
    size,
    revision: revision(mtimeMs, size),
  })
}

function parseDirectory(value: unknown, spaceId: string, requestedPath: string): CohubSpaceDirectory {
  const body = record(value, 'tree response')
  if (body.path !== requestedPath) throw new TypeError('cohub-spaces: tree response path does not match request')
  if (!Array.isArray(body.entries)) throw new TypeError('cohub-spaces: tree response entries must be an array')
  const paths = new Set<string>()
  const entries = body.entries.map((item, index) => {
    const entry = parseEntry(item, requestedPath, index)
    if (paths.has(entry.path)) throw new TypeError(`cohub-spaces: duplicate tree entry "${entry.path}"`)
    paths.add(entry.path)
    return entry
  })
  return Object.freeze({ spaceId, path: requestedPath, entries: Object.freeze(entries) })
}

function parseTextFile(value: unknown, spaceId: string, requestedPath: string): CohubSpaceTextFile {
  const body = record(value, 'file response')
  if (body.path !== requestedPath) throw new TypeError('cohub-spaces: file response path does not match request')
  if (body.kind === undefined && body.retryAfterMs !== undefined) {
    throw new CohubSpaceFilePreparingError(safeInteger(body.retryAfterMs, 'file retryAfterMs'))
  }
  if (body.kind !== 'text' || body.encoding !== 'utf-8') {
    throw new TypeError('cohub-spaces: only inline UTF-8 text files are supported')
  }
  if (body.delivery !== undefined && body.delivery !== 'inline') {
    throw new TypeError('cohub-spaces: URL-delivered files are not supported by the text adapter')
  }
  if (typeof body.content !== 'string') throw new TypeError('cohub-spaces: file content must be a string')
  const size = safeInteger(body.size, 'file size')
  const mtimeMs = nonNegativeNumber(body.mtimeMs, 'file mtimeMs')
  return Object.freeze({
    spaceId,
    path: requestedPath,
    content: body.content,
    revision: revision(mtimeMs, size),
  })
}

async function responseData(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    await response.text().catch(() => '')
    return undefined
  }
  try {
    return await response.json()
  } catch (error) {
    throw new Error(`cohub-spaces: HTTP ${String(response.status)} returned invalid JSON`, { cause: error })
  }
}

function apiErrorMessage(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'request failed'
  const body = value as Record<string, unknown>
  for (const field of ['message', 'error'] as const) {
    if (typeof body[field] === 'string' && body[field].trim().length > 0) return body[field]
  }
  return 'request failed'
}

/** Typed Remote service backed only by Cohub account tokens and platform HTTP. */
export class CohubSpacesGateway extends TypertRemoteService {
  static inject = ['cohubAccount', 'agents']

  static Config: z<Config> = z.object({
    apiBaseUrl: z.string().default(DEFAULT_COHUB_API_BASE_URL),
    localCwd: z.string().default(process.cwd()),
    runPollIntervalMs: z.number().step(1).min(100).max(10_000).default(1_000),
    runTimeoutMs: z.number().step(1).min(1_000).max(3_600_000).default(120_000),
  })

  private readonly apiBaseUrl: string
  private readonly localCwd: string
  private readonly runPollIntervalMs: number
  private readonly runTimeoutMs: number
  private readonly lifetime = new AbortController()
  private readonly active = new Set<Promise<unknown>>()
  private readonly bindings = new Map<string, SpaceBinding & { readonly dispose: () => void }>()
  private readonly referenceTools = new Map<string, { readonly agent: Agent; readonly dispose: () => void }>()
  private closed = false

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'cohubSpaces')
    this.apiBaseUrl = normalizeUrl(config.apiBaseUrl ?? DEFAULT_COHUB_API_BASE_URL)
    this.localCwd = absoluteCwd(config.localCwd ?? process.cwd())
    this.runPollIntervalMs = config.runPollIntervalMs ?? 1_000
    this.runTimeoutMs = config.runTimeoutMs ?? 120_000
  }

  *[Service.init](): Generator<() => Promise<void>, void, void> {
    const unsubscribe = this.ctx.cohubAccount.snapshot.subscribe(() => {
      if (!this.closed) this.ctx.emit('cohub-spaces/changed')
    })
    const stopCreated = this.ctx.on('agent/created', ({ agent }) => {
      this.installReferenceTools(agent)
      const binding = this.bindingFromSession(agent)
      if (binding !== undefined) this.installBinding(agent, binding, false)
    })
    const stopDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      this.bindings.delete(agent.id)
      const installed = this.referenceTools.get(agent.id)
      if (installed?.agent === agent) {
        installed.dispose()
        this.referenceTools.delete(agent.id)
      }
    })
    yield async () => {
      this.closed = true
      unsubscribe()
      stopCreated()
      stopDisposed()
      for (const binding of this.bindings.values()) binding.dispose()
      this.bindings.clear()
      for (const installed of this.referenceTools.values()) installed.dispose()
      this.referenceTools.clear()
      this.lifetime.abort(new Error('cohub-spaces: service disposed'))
      await Promise.allSettled([...this.active])
    }
  }

  /**
   * List all Spaces accessible to the current account.
   * @returns The authenticated account's Spaces.
   */
  @Remote('listSpaces')
  listSpaces(): Promise<readonly CohubSpaceView[]> {
    return this.track(this.listSpacesImpl())
  }

  /**
   * List every conversation in one Space, following the platform cursor.
   * @param spaceId Cohub Space identity.
   * @returns The complete Session listing.
   */
  @Remote('listSessions')
  listSessions(spaceId: string): Promise<CohubSpaceSessionList> {
    return this.track(this.listSessionsImpl(spaceId))
  }

  /**
   * Read all currently retained Turns for one Cohub Session.
   * @param spaceId Cohub Space identity.
   * @param sessionId Cohub Session identity.
   * @returns The complete retained conversation view.
   */
  @Remote('getConversation')
  getConversation(spaceId: string, sessionId: string): Promise<CohubConversationView> {
    return this.track(this.getConversationImpl(spaceId, sessionId))
  }

  /**
   * Submit one prompt directly to Cohub Agent, creating a Session when sessionId is null.
   * @param spaceId Cohub Space identity.
   * @param sessionId Existing Cohub Session identity, or null for a new Session.
   * @param content User-authored text.
   * @param clientMessageId Caller-generated idempotency identity.
   * @returns The Cohub-owned Session and accepted Turn.
   */
  @Remote('sendPrompt')
  sendPrompt(spaceId: string, sessionId: string | null, content: string, clientMessageId: string): Promise<CohubPromptSubmission> {
    return this.track(this.sendPromptImpl(spaceId, sessionId, content, clientMessageId))
  }

  /**
   * Abort one running native Cohub Agent Turn after verifying its Space ownership.
   * @param spaceId Cohub Space identity.
   * @param sessionId Cohub Session identity.
   * @param turnId Cohub Turn identity.
   * @returns Confirmation that Cohub accepted the abort.
   */
  @Remote('abortTurn')
  abortTurn(spaceId: string, sessionId: string, turnId: string): Promise<CohubAbortTurnResult> {
    return this.track(this.abortTurnImpl(spaceId, sessionId, turnId))
  }

  /**
   * Resolve the local DSH working directory used for a Cohub-bound Session.
   * @param spaceId Cohub Space identity.
   * @returns The verified Space identity and local cwd anchor.
   */
  @Remote('getDshSessionStart')
  getDshSessionStart(spaceId: string): Promise<CohubDshSessionStart> {
    return this.track(this.getDshSessionStartImpl(spaceId))
  }

  /**
   * Attach one Cohub Space to an existing blank DSH Session.
   * @param spaceId Cohub Space identity.
   * @param dshSessionId Blank DSH Session identity.
   * @returns The installed binding.
   */
  @Remote('bindDshSession')
  bindDshSession(spaceId: string, dshSessionId: string): Promise<CohubDshSessionBinding> {
    return this.track(this.bindDshSessionImpl(spaceId, dshSessionId))
  }

  /**
   * List one exact Space-relative directory.
   * @param spaceId Cohub Space identity.
   * @param path Space-relative directory path.
   * @returns The exact directory listing.
   */
  @Remote('listDirectory')
  listDirectory(spaceId: string, path: string): Promise<CohubSpaceDirectory> {
    return this.track(this.listDirectoryImpl(spaceId, path))
  }

  /**
   * Read one inline UTF-8 text file.
   * @param spaceId Cohub Space identity.
   * @param path Space-relative file path.
   * @returns The file content and revision.
   */
  @Remote('readText')
  readText(spaceId: string, path: string): Promise<CohubSpaceTextFile> {
    return this.track(this.readTextImpl(spaceId, path))
  }

  /**
   * Compare-and-set one UTF-8 text file.
   * @param spaceId Cohub Space identity.
   * @param path Space-relative file path.
   * @param content Replacement UTF-8 content.
   * @param ifRevision Required current revision.
   * @returns The new file or a version conflict.
   */
  @Remote('writeText')
  writeText(spaceId: string, path: string, content: string, ifRevision: string): Promise<CohubSpaceWriteResult> {
    return this.track(this.writeTextImpl(spaceId, path, content, ifRevision))
  }

  private async listSpacesImpl(): Promise<readonly CohubSpaceView[]> {
    const { data } = await this.request('/api/spaces')
    return parseSpaces(data)
  }

  private async listSessionsImpl(spaceIdValue: string): Promise<CohubSpaceSessionList> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const token = await this.ctx.cohubAccount.getAccessToken()
    const sessions: CohubSessionView[] = []
    const ids = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const params = new URLSearchParams({ limit: '100' })
      if (cursor !== undefined) params.set('cursor', cursor)
      const { data } = await this.requestWithToken(
        `/api/spaces/${encodeURIComponent(spaceId)}/sessions?${params.toString()}`,
        token,
      )
      const page = parseSessionPage(data, spaceId)
      for (const session of page.sessions) {
        if (ids.has(session.id)) throw new TypeError(`cohub-spaces: duplicate session id "${session.id}"`)
        ids.add(session.id)
        sessions.push(session)
      }
      if (!page.hasMore) break
      cursor = page.nextCursor
      if (cursor === undefined || cursors.has(cursor)) {
        throw new TypeError('cohub-spaces: sessions response cursor did not advance')
      }
      cursors.add(cursor)
    } while (true)
    return Object.freeze({ spaceId, sessions: Object.freeze(sessions) })
  }

  private async getConversationImpl(spaceIdValue: string, sessionIdValue: string): Promise<CohubConversationView> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const sessionId = nonBlank(sessionIdValue, 'sessionId')
    const token = await this.ctx.cohubAccount.getAccessToken()
    const turns: CohubTurnView[] = []
    const ids = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | undefined
    let session!: CohubSessionView
    let firstPage = true
    do {
      const params = new URLSearchParams({ direction: 'older', limit: '100' })
      if (cursor !== undefined) params.set('cursor', cursor)
      const { data } = await this.requestWithToken(
        `/api/sessions/${encodeURIComponent(sessionId)}/turns?${params.toString()}`,
        token,
      )
      const page = parseTurnPage(data, spaceId, sessionId)
      if (firstPage) {
        session = page.session
        firstPage = false
      } else if (page.session.updatedAt !== session.updatedAt || page.session.title !== session.title) {
        throw new TypeError('cohub-spaces: turns pages disagree about their Session')
      }
      for (const turn of page.turns) {
        if (ids.has(turn.id)) throw new TypeError(`cohub-spaces: duplicate turn id "${turn.id}"`)
        ids.add(turn.id)
        turns.push(turn)
      }
      if (!page.hasMore) break
      cursor = page.nextCursor
      if (cursor === undefined || cursors.has(cursor)) {
        throw new TypeError('cohub-spaces: turns response cursor did not advance')
      }
      cursors.add(cursor)
    } while (true)
    turns.sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    return Object.freeze({ spaceId, session, turns: Object.freeze(turns) })
  }

  private async sendPromptImpl(
    spaceIdValue: string,
    sessionIdValue: string | null,
    contentValue: string,
    clientMessageIdValue: string,
  ): Promise<CohubPromptSubmission> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const sessionId = sessionIdValue === null ? undefined : nonBlank(sessionIdValue, 'sessionId')
    const content = nonBlank(contentValue, 'content')
    const clientMessageId = nonBlank(clientMessageIdValue, 'clientMessageId')
    const { data } = await this.request(`/api/spaces/${encodeURIComponent(spaceId)}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sessionId === undefined ? {} : { sessionId },
        content: [{ type: 'text', text: content }],
        clientMessageId,
        accessMode: 'full_access',
      }),
    })
    const body = record(data, 'prompt response')
    if (body.mode !== 'immediate') throw new TypeError('cohub-spaces: prompt response must be immediate')
    const accepted = parseTurnResponse(body, spaceId, sessionId)
    return Object.freeze({ spaceId, ...accepted })
  }

  private async abortTurnImpl(
    spaceIdValue: string,
    sessionIdValue: string,
    turnIdValue: string,
  ): Promise<CohubAbortTurnResult> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const sessionId = nonBlank(sessionIdValue, 'sessionId')
    const turnId = nonBlank(turnIdValue, 'turnId')
    const verified = await this.request(
      `/api/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`,
    )
    const current = parseTurnResponse(verified.data, spaceId, sessionId)
    if (current.turn.id !== turnId) throw new TypeError('cohub-spaces: turn response Turn does not match request')
    const { data } = await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnId }),
    })
    if (record(data, 'abort response').ok !== true) throw new TypeError('cohub-spaces: abort response was not successful')
    return Object.freeze({ ok: true, spaceId, sessionId, turnId })
  }

  private async bindDshSessionImpl(spaceIdValue: string, dshSessionIdValue: string): Promise<CohubDshSessionBinding> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const dshSessionId = nonBlank(dshSessionIdValue, 'dshSessionId')
    const agent = this.ctx.agents.get(SessionId(dshSessionId))
    if (agent === undefined) throw new Error(`cohub-spaces: DSH Session "${dshSessionId}" is not live`)
    const existing = this.bindings.get(dshSessionId)
    if (existing !== undefined) {
      if (existing.spaceId !== spaceId) {
        throw new Error(`cohub-spaces: DSH Session "${dshSessionId}" is already bound to Space "${existing.spaceId}"`)
      }
      return Object.freeze({ spaceId, spaceTitle: existing.spaceTitle, dshSessionId })
    }
    if (agent.session.events.some(event => event.type === 'user/message' && event.data.source.kind === 'user')) {
      throw new Error(`cohub-spaces: DSH Session "${dshSessionId}" already contains a user turn`)
    }
    const space = (await this.listSpacesImpl()).find(item => item.id === spaceId)
    if (space === undefined) throw new Error(`cohub-spaces: Space "${spaceId}" is not accessible to the current account`)
    this.installReferenceTools(agent)
    this.installBinding(agent, { spaceId, spaceTitle: space.title }, true)
    return Object.freeze({ spaceId, spaceTitle: space.title, dshSessionId })
  }

  private async getDshSessionStartImpl(spaceIdValue: string): Promise<CohubDshSessionStart> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const accessible = (await this.listSpacesImpl()).some(item => item.id === spaceId)
    if (!accessible) throw new Error(`cohub-spaces: Space "${spaceId}" is not accessible to the current account`)
    return Object.freeze({ spaceId, cwd: this.localCwd })
  }

  private bindingFromSession(agent: Agent): SpaceBinding | undefined {
    for (let index = agent.session.events.length - 1; index >= 0; index--) {
      const event = agent.session.events[index]
      if (event?.type !== 'user/message'
        || event.data.source.kind !== 'plugin'
        || event.data.source.plugin !== BINDING_PLUGIN) continue
      const block = event.data.content[0]
      if (block?.type !== 'text') throw new TypeError('cohub-spaces: persisted binding message must start with text')
      return parseBindingText(block.text)
    }
    return undefined
  }

  private installBinding(agent: Agent, binding: SpaceBinding, injectContext: boolean): void {
    const current = this.bindings.get(agent.id)
    if (current !== undefined) {
      if (current.spaceId !== binding.spaceId) {
        throw new Error(`cohub-spaces: DSH Session "${agent.id}" has conflicting Space bindings`)
      }
      return
    }
    const disposers: (() => void)[] = []
    const dispose = disposeStack(disposers)
    try {
      disposers.push(agent.ctx.systemPrompt.section({
        name: 'cohub-space-workspace',
        order: 50,
        text: `This DSH Session is attached to Cohub Space ${JSON.stringify(binding.spaceTitle)} (${binding.spaceId}). Keep using ordinary local DSH tools for local work. Use the cohub_space_* tools for cloud files and commands; their paths are relative to the Space root.`,
      }))
      this.bindings.set(agent.id, Object.freeze({ ...binding, dispose }))
      if (injectContext) {
        agent.inject(createUserMessage({
          content: [{ type: 'text', text: bindingText(binding) }],
          source: { kind: 'plugin', plugin: BINDING_PLUGIN, form: 'instructions' },
        }))
      }
    } catch (error) {
      this.bindings.delete(agent.id)
      dispose()
      throw error
    }
  }

  private installReferenceTools(agent: Agent): void {
    const current = this.referenceTools.get(agent.id)
    if (current !== undefined) {
      if (current.agent !== agent) throw new Error(`cohub-spaces: conflicting live Agent "${agent.id}"`)
      return
    }
    const disposers: (() => void)[] = []
    const dispose = disposeStack(disposers)
    try {
      disposers.push(agent.ctx.systemPrompt.section({
        name: 'cohub-space-references',
        order: 49,
        text: 'When a user adds an @Cohub Space reference, use the cohub_space_* tools with the exact space_id carried by that reference. A Cohub Space is cloud storage, not a local path. Do not access a Space unless the user referenced it or explicitly supplied its id.',
      }))
      disposers.push(...this.registerReferenceTools(agent))
      this.referenceTools.set(agent.id, Object.freeze({ agent, dispose }))
    } catch (error) {
      dispose()
      throw error
    }
  }

  private referencedSpaceId(agent: Agent, value: unknown): string {
    if (value !== undefined) return nonBlank(value, 'space_id')
    const binding = this.bindings.get(agent.id)
    if (binding !== undefined) return binding.spaceId
    throw new TypeError('cohub-spaces: space_id is required unless this DSH Session has a legacy Space binding')
  }

  private registerReferenceTools(agent: Agent): (() => void)[] {
    const render = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }]
    const json = (value: unknown): JsonValue => structuredClone(value) as JsonValue
    return [
      agent.ctx.tools.register(defineTool({
        name: 'cohub_space_list',
        description: 'List one directory in a referenced Cohub Space. Paths are Space-relative POSIX paths.',
        parameters: {
          space_id: { type: 'string', description: 'Exact Space id from the @Cohub Space reference. Omit only for a legacy bound Session.' },
          path: { type: 'string', description: 'Directory path relative to the Space root. Omit for the root.' },
        },
        output: { schema: { type: 'json' }, render },
        execute: async (args, exec) => json(await this.listDirectoryImpl(this.referencedSpaceId(agent, args.space_id), args.path ?? '', exec.signal)),
      })),
      agent.ctx.tools.register(defineTool({
        name: 'cohub_space_read',
        description: 'Read one UTF-8 text file from a referenced Cohub Space.',
        parameters: {
          space_id: { type: 'string', description: 'Exact Space id from the @Cohub Space reference. Omit only for a legacy bound Session.' },
          path: { type: 'string', required: true, description: 'File path relative to the Space root.' },
        },
        output: { schema: { type: 'json' }, render },
        execute: async (args, exec) => json(await this.readTextImpl(this.referencedSpaceId(agent, args.space_id), args.path, exec.signal)),
      })),
      agent.ctx.tools.register(defineTool({
        name: 'cohub_space_write',
        description: 'Compare-and-set one UTF-8 text file in a referenced Cohub Space. Read first and pass its revision.',
        parameters: {
          space_id: { type: 'string', description: 'Exact Space id from the @Cohub Space reference. Omit only for a legacy bound Session.' },
          path: { type: 'string', required: true, description: 'File path relative to the Space root.' },
          content: { type: 'string', required: true, description: 'Complete replacement content.' },
          if_revision: { type: 'string', required: true, description: 'Revision returned by cohub_space_read.' },
        },
        output: { schema: { type: 'json' }, render },
        execute: async (args, exec) => json(await this.writeTextImpl(
          this.referencedSpaceId(agent, args.space_id),
          args.path,
          args.content,
          args.if_revision,
          exec.signal,
        )),
      })),
      agent.ctx.tools.register(defineTool({
        name: 'cohub_space_run',
        description: 'Run a shell command inside a referenced Cohub Space and wait for its completed output.',
        parameters: {
          space_id: { type: 'string', description: 'Exact Space id from the @Cohub Space reference. Omit only for a legacy bound Session.' },
          command: { type: 'string', required: true, description: 'Non-empty shell command to run in the Cohub Space.' },
        },
        output: { schema: { type: 'json' }, render },
        execute: async (args, exec) => json(await this.runCommandImpl(
          this.referencedSpaceId(agent, args.space_id), args.command, exec.signal,
        )),
      })),
    ]
  }

  private async listDirectoryImpl(spaceIdValue: string, pathValue: string, signal?: AbortSignal): Promise<CohubSpaceDirectory> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const path = spacePath(pathValue, 'path', true)
    const params = new URLSearchParams()
    if (path.length > 0) params.set('path', path)
    const query = params.toString()
    const { data } = await this.request(`/api/spaces/${encodeURIComponent(spaceId)}/fs/tree${query ? `?${query}` : ''}`, {}, signal)
    return parseDirectory(data, spaceId, path)
  }

  private async readTextImpl(spaceIdValue: string, pathValue: string, signal?: AbortSignal): Promise<CohubSpaceTextFile> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const path = spacePath(pathValue, 'path', false)
    const token = await this.ctx.cohubAccount.getAccessToken()
    return this.readTextWithToken(spaceId, path, token, signal)
  }

  private async writeTextImpl(
    spaceIdValue: string,
    pathValue: string,
    content: string,
    ifRevision: string,
    signal?: AbortSignal,
  ): Promise<CohubSpaceWriteResult> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const path = spacePath(pathValue, 'path', false)
    if (typeof content !== 'string') throw new TypeError('cohub-spaces: content must be a string')
    const expected = expectedRevision(ifRevision)
    const token = await this.ctx.cohubAccount.getAccessToken()
    const result = await this.requestWithToken(`/api/spaces/${encodeURIComponent(spaceId)}/fs/file`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content, encoding: 'utf-8', expected }),
    }, true, signal)
    if (result.response.status === 409 || result.response.status === 412) {
      return Object.freeze({
        ok: false,
        error: Object.freeze({
          code: 'version-conflict',
          current: await this.readTextWithToken(spaceId, path, token, signal),
        }),
      })
    }
    this.assertSuccessful(result)
    const body = record(result.data, 'write response')
    if (body.ok !== true || body.path !== path) throw new TypeError('cohub-spaces: write response does not match request')
    const size = safeInteger(body.size, 'write response size')
    const mtimeMs = nonNegativeNumber(body.mtimeMs, 'write response mtimeMs')
    return Object.freeze({
      ok: true,
      value: Object.freeze({ spaceId, path, content, revision: revision(mtimeMs, size) }),
    })
  }

  private async runCommandImpl(spaceIdValue: string, commandValue: string, signal: AbortSignal): Promise<CohubRunResult> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const command = nonBlank(commandValue, 'command')
    const token = await this.ctx.cohubAccount.getAccessToken()
    const created = await this.requestWithToken(`/api/spaces/${encodeURIComponent(spaceId)}/commands`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    }, false, signal)
    const taskRunId = nonBlank(record(created.data, 'command response').taskRunId, 'command response taskRunId')
    const deadline = Date.now() + this.runTimeoutMs
    while (true) {
      if (Date.now() >= deadline) throw new Error(`cohub-spaces: command timed out after ${String(this.runTimeoutMs)}ms`)
      const detail = await this.requestWithToken(`/api/tasks/${encodeURIComponent(taskRunId)}`, token, {}, false, signal)
      const body = record(detail.data, 'task response')
      const run = record(body.run, 'task response run')
      const status = nonBlank(run.status, 'task response run status')
      if (status === 'failed') {
        throw new Error(`cohub-spaces: command failed: ${nonBlank(run.errorMessage, 'task response run errorMessage')}`)
      }
      if (status === 'completed') return this.parseRunResult(run.result)
      await waitForPoll(Math.min(this.runPollIntervalMs, Math.max(1, deadline - Date.now())), signal)
    }
  }

  private parseRunResult(value: unknown): CohubRunResult {
    const result = record(value, 'task response run result')
    if (typeof result.output !== 'string') throw new TypeError('cohub-spaces: task output must be a string')
    if (typeof result.truncated !== 'boolean') throw new TypeError('cohub-spaces: task truncated must be a boolean')
    const durationMs = nonNegativeNumber(result.durationMs, 'task durationMs')
    const exitCode = result.exitCode === null || result.exitCode === undefined
      ? undefined
      : safeInteger(result.exitCode, 'task exitCode')
    let termination: string | undefined
    if (result.termination !== null && result.termination !== undefined) {
      const detail = record(result.termination, 'task termination')
      termination = nonBlank(detail.reason, 'task termination reason')
    }
    return Object.freeze({
      output: result.output,
      durationMs,
      truncated: result.truncated,
      ...exitCode === undefined ? {} : { exitCode },
      ...termination === undefined ? {} : { termination },
    })
  }

  private async readTextWithToken(spaceId: string, path: string, token: string, signal?: AbortSignal): Promise<CohubSpaceTextFile> {
    const params = new URLSearchParams({ path })
    const { data } = await this.requestWithToken(
      `/api/spaces/${encodeURIComponent(spaceId)}/fs/file?${params.toString()}`,
      token,
      {},
      false,
      signal,
    )
    return parseTextFile(data, spaceId, path)
  }

  private async request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<JsonResponse> {
    const token = await this.ctx.cohubAccount.getAccessToken()
    return this.requestWithToken(path, token, init, false, signal)
  }

  private async requestWithToken(
    path: string,
    token: string,
    init: RequestInit = {},
    allowConflict = false,
    signal?: AbortSignal,
  ): Promise<JsonResponse> {
    this.assertOpen()
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers,
      signal: signal === undefined ? this.lifetime.signal : AbortSignal.any([this.lifetime.signal, signal]),
    })
    const result = { response, data: await responseData(response) }
    if (!allowConflict || (response.status !== 409 && response.status !== 412)) this.assertSuccessful(result)
    return result
  }

  private assertSuccessful(result: JsonResponse): void {
    if (!result.response.ok) {
      throw new CohubSpacesHttpError(result.response.status, apiErrorMessage(result.data))
    }
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.assertOpen()
    this.active.add(promise)
    void promise.finally(() => { this.active.delete(promise) }).catch(() => {})
    return promise
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('cohub-spaces: service is disposed')
  }
}

export default CohubSpacesGateway
