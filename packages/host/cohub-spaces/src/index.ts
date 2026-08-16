/** Host-side Cohub Space/files adapter. */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_COHUB_API_BASE_URL,
  type CohubAccountService,
} from '@deepseek-ai/dsh-cohub-account'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CohubSpaceDirectory,
  CohubConversationPromptResult,
  CohubConversationView,
  CohubSpaceEntry,
  CohubSpaceSessionList,
  CohubSpaceTextFile,
  CohubSpaceView,
  CohubSpaceWriteResult,
  CohubSessionView,
  CohubTurnView,
} from './types.ts'

export type * from './types.ts'

export interface Config {
  apiBaseUrl?: string
}

interface JsonResponse {
  readonly response: Response
  readonly data: unknown
}

interface ExpectedRevision {
  readonly mtimeMs: number
  readonly size: number
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
    title: nonBlank(session.title, `session "${id}" title`),
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

function parseTurnPage(value: unknown, spaceId: string, sessionId: string): TurnPage {
  const body = record(value, 'turns response')
  const session = parseSession(body.session, spaceId, 'turns response session')
  if (session.id !== sessionId) throw new TypeError('cohub-spaces: turns response Session does not match request')
  if (!Array.isArray(body.turns)) throw new TypeError('cohub-spaces: turns response turns must be an array')
  if (typeof body.hasMore !== 'boolean') throw new TypeError('cohub-spaces: turns response hasMore must be a boolean')
  const nextCursor = body.hasMore ? String(safeInteger(body.nextCursor, 'turns response nextCursor')) : undefined
  const turns = body.turns.map((value, index) => {
    const turn = record(value, `turn ${String(index)}`)
    const id = nonBlank(turn.id, `turn ${String(index)} id`)
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
  })
  return Object.freeze({ session, turns: Object.freeze(turns), hasMore: body.hasMore, ...nextCursor ? { nextCursor } : {} })
}

function parsePromptResult(value: unknown, spaceId: string): CohubConversationPromptResult {
  const body = record(value, 'prompt response')
  if (body.mode !== 'immediate') throw new TypeError('cohub-spaces: prompt response must be immediate')
  const session = parseSession(body.session, spaceId, 'prompt response session')
  const turn = record(body.turn, 'prompt response turn')
  const turnId = nonBlank(turn.id, 'prompt response turn id')
  if (turn.sessionId !== session.id) throw new TypeError('cohub-spaces: prompt response Turn does not belong to its Session')
  return Object.freeze({
    spaceId,
    sessionId: session.id,
    sessionTitle: session.title,
    turnId,
    turnStatus: nonBlank(turn.status, 'prompt response turn status'),
  })
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
  static inject = ['cohubAccount']

  static Config: z<Config> = z.object({
    apiBaseUrl: z.string().default(DEFAULT_COHUB_API_BASE_URL),
  })

  private readonly apiBaseUrl: string
  private readonly lifetime = new AbortController()
  private readonly active = new Set<Promise<unknown>>()
  private closed = false

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'cohubSpaces')
    this.apiBaseUrl = normalizeUrl(config.apiBaseUrl ?? DEFAULT_COHUB_API_BASE_URL)
  }

  *[Service.init](): Generator<() => Promise<void>, void, void> {
    const unsubscribe = this.ctx.cohubAccount.snapshot.subscribe(() => {
      if (!this.closed) this.ctx.emit('cohub-spaces/changed')
    })
    yield async () => {
      this.closed = true
      unsubscribe()
      this.lifetime.abort(new Error('cohub-spaces: service disposed'))
      await Promise.allSettled([...this.active])
    }
  }

  /** List all Spaces accessible to the current account. */
  @Remote('listSpaces')
  listSpaces(): Promise<readonly CohubSpaceView[]> {
    return this.track(this.listSpacesImpl())
  }

  /** List every conversation in one Space, following the platform cursor. */
  @Remote('listSessions')
  listSessions(spaceId: string): Promise<CohubSpaceSessionList> {
    return this.track(this.listSessionsImpl(spaceId))
  }

  /** Read all currently retained Turns for one Cohub Session. */
  @Remote('getConversation')
  getConversation(spaceId: string, sessionId: string): Promise<CohubConversationView> {
    return this.track(this.getConversationImpl(spaceId, sessionId))
  }

  /** Send text to an existing Cohub Session, or create one on the first prompt. */
  @Remote('promptConversation')
  promptConversation(
    spaceId: string,
    sessionId: string | undefined,
    text: string,
  ): Promise<CohubConversationPromptResult> {
    return this.track(this.promptConversationImpl(spaceId, sessionId, text))
  }

  /** List one exact Space-relative directory. */
  @Remote('listDirectory')
  listDirectory(spaceId: string, path: string): Promise<CohubSpaceDirectory> {
    return this.track(this.listDirectoryImpl(spaceId, path))
  }

  /** Read one inline UTF-8 text file. */
  @Remote('readText')
  readText(spaceId: string, path: string): Promise<CohubSpaceTextFile> {
    return this.track(this.readTextImpl(spaceId, path))
  }

  /** Compare-and-set one UTF-8 text file. */
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

  private async promptConversationImpl(
    spaceIdValue: string,
    sessionIdValue: string | undefined,
    textValue: string,
  ): Promise<CohubConversationPromptResult> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const sessionId = sessionIdValue === undefined ? undefined : nonBlank(sessionIdValue, 'sessionId')
    const text = nonBlank(textValue, 'text')
    const { data } = await this.request(`/api/spaces/${encodeURIComponent(spaceId)}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sessionId === undefined ? {} : { sessionId },
        content: [{ type: 'text', text }],
        accessMode: 'full_access',
      }),
    })
    return parsePromptResult(data, spaceId)
  }

  private async listDirectoryImpl(spaceIdValue: string, pathValue: string): Promise<CohubSpaceDirectory> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const path = spacePath(pathValue, 'path', true)
    const params = new URLSearchParams()
    if (path.length > 0) params.set('path', path)
    const query = params.toString()
    const { data } = await this.request(`/api/spaces/${encodeURIComponent(spaceId)}/fs/tree${query ? `?${query}` : ''}`)
    return parseDirectory(data, spaceId, path)
  }

  private async readTextImpl(spaceIdValue: string, pathValue: string): Promise<CohubSpaceTextFile> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const path = spacePath(pathValue, 'path', false)
    const token = await this.ctx.cohubAccount.getAccessToken()
    return this.readTextWithToken(spaceId, path, token)
  }

  private async writeTextImpl(
    spaceIdValue: string,
    pathValue: string,
    content: string,
    ifRevision: string,
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
    }, true)
    if (result.response.status === 409 || result.response.status === 412) {
      return Object.freeze({
        ok: false,
        error: Object.freeze({
          code: 'version-conflict',
          current: await this.readTextWithToken(spaceId, path, token),
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

  private async readTextWithToken(spaceId: string, path: string, token: string): Promise<CohubSpaceTextFile> {
    const params = new URLSearchParams({ path })
    const { data } = await this.requestWithToken(
      `/api/spaces/${encodeURIComponent(spaceId)}/fs/file?${params.toString()}`,
      token,
    )
    return parseTextFile(data, spaceId, path)
  }

  private async request(path: string, init: RequestInit = {}): Promise<JsonResponse> {
    const token = await this.ctx.cohubAccount.getAccessToken()
    return this.requestWithToken(path, token, init)
  }

  private async requestWithToken(
    path: string,
    token: string,
    init: RequestInit = {},
    allowConflict = false,
  ): Promise<JsonResponse> {
    this.assertOpen()
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers,
      signal: this.lifetime.signal,
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
