/** Host-side, read-only Cohub Board adapter. */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_COHUB_API_BASE_URL,
  type CohubAccountService,
} from '@deepseek-ai/dsh-cohub-account'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'
import type {
  CohubBoardConnection,
  CohubBoardEndpoint,
  CohubBoardManifest,
  CohubBoardNode,
  CohubBoardRecord,
  CohubBoardSnapshot,
} from './types.ts'

export type * from './types.ts'

/** Cohub Board adapter configuration. */
export interface Config {
  /** Cohub API origin. */
  apiBaseUrl?: string
}

/** Cohub Board HTTP rejection with its response status. */
export class CohubBoardHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(`cohub-board: HTTP ${String(status)}: ${message}`)
    this.name = 'CohubBoardHttpError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    cohubAccount: CohubAccountService
    cohubBoard: CohubBoardGateway
  }
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`cohub-board: ${field} must be a non-blank string`)
  }
  return value
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`cohub-board: ${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`cohub-board: ${field} must be an array`)
  return value
}

function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`cohub-board: ${field} must be finite`)
  }
  return value
}

function natural(value: unknown, field: string): number {
  const number = finite(value, field)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`cohub-board: ${field} must be a non-negative safe integer`)
  }
  return number
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new TypeError(`cohub-board: ${field} must be a string or null`)
  return value
}

function timestamp(value: unknown, field: string): string | null {
  if (value === null) return null
  const result = nonBlank(value, field)
  if (Number.isNaN(Date.parse(result))) throw new TypeError(`cohub-board: ${field} must be an ISO timestamp or null`)
  return result
}

function normalizeUrl(value: string): string {
  const parsed = new URL(nonBlank(value, 'apiBaseUrl').replace(/\/+$/, ''))
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('cohub-board: apiBaseUrl must use HTTP or HTTPS')
  }
  return parsed.toString().replace(/\/$/, '')
}

function jsonValue(value: unknown, field: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`cohub-board: ${field} must contain finite numbers`)
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${field}[${String(index)}]`))
  const source = record(value, field)
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, jsonValue(item, `${field}.${key}`)]))
}

function plain(value: unknown, field: string): Readonly<Record<string, JsonValue>> {
  const source = record(value, field)
  return Object.freeze(Object.fromEntries(Object.entries(source).map(([key, item]) => [key, jsonValue(item, `${field}.${key}`)])))
}

function parseBoard(value: unknown, spaceId: string, boardId: string): CohubBoardRecord {
  const item = record(value, 'board')
  if (nonBlank(item.id, 'board id') !== boardId) throw new TypeError('cohub-board: response board id does not match request')
  if (nonBlank(item.spaceId, 'board spaceId') !== spaceId) throw new TypeError('cohub-board: response Space id does not match request')
  return Object.freeze({
    id: boardId,
    spaceId,
    title: nonBlank(item.title, 'board title'),
    version: natural(item.version, 'board version'),
    metadata: plain(item.metadata, 'board metadata'),
    createdAt: timestamp(item.createdAt, 'board createdAt'),
    updatedAt: timestamp(item.updatedAt, 'board updatedAt'),
  })
}

function parseNode(value: unknown, boardId: string, index: number): CohubBoardNode {
  const item = record(value, `node ${String(index)}`)
  if (nonBlank(item.boardId, `node ${String(index)} boardId`) !== boardId) {
    throw new TypeError(`cohub-board: node ${String(index)} belongs to another Board`)
  }
  const width = finite(item.width, `node ${String(index)} width`)
  const height = finite(item.height, `node ${String(index)} height`)
  if (width <= 0 || height <= 0) throw new TypeError(`cohub-board: node ${String(index)} has invalid geometry`)
  return Object.freeze({
    boardId,
    nodeId: nonBlank(item.nodeId, `node ${String(index)} nodeId`),
    type: nonBlank(item.type, `node ${String(index)} type`),
    parentId: nullableString(item.parentId, `node ${String(index)} parentId`),
    orderKey: nullableString(item.orderKey, `node ${String(index)} orderKey`),
    x: finite(item.x, `node ${String(index)} x`),
    y: finite(item.y, `node ${String(index)} y`),
    width,
    height,
    rotation: finite(item.rotation, `node ${String(index)} rotation`),
    refKind: nullableString(item.refKind, `node ${String(index)} refKind`),
    refPath: nullableString(item.refPath, `node ${String(index)} refPath`),
    refUrl: nullableString(item.refUrl, `node ${String(index)} refUrl`),
    view: plain(item.view, `node ${String(index)} view`),
    style: plain(item.style, `node ${String(index)} style`),
    data: plain(item.data, `node ${String(index)} data`),
    version: natural(item.version, `node ${String(index)} version`),
    createdAt: timestamp(item.createdAt, `node ${String(index)} createdAt`),
    updatedAt: timestamp(item.updatedAt, `node ${String(index)} updatedAt`),
  })
}

function endpoint(value: unknown, field: string): CohubBoardEndpoint {
  return Object.freeze({ nodeId: nonBlank(record(value, field).nodeId, `${field} nodeId`) })
}

function parseConnection(value: unknown, boardId: string, index: number): CohubBoardConnection {
  const item = record(value, `connection ${String(index)}`)
  if (nonBlank(item.boardId, `connection ${String(index)} boardId`) !== boardId) {
    throw new TypeError(`cohub-board: connection ${String(index)} belongs to another Board`)
  }
  const direction = item.direction
  if (direction !== 'none' && direction !== 'forward' && direction !== 'backward' && direction !== 'both') {
    throw new TypeError(`cohub-board: connection ${String(index)} has invalid direction`)
  }
  return Object.freeze({
    id: nonBlank(item.id, `connection ${String(index)} id`),
    boardId,
    source: endpoint(item.source, `connection ${String(index)} source`),
    target: endpoint(item.target, `connection ${String(index)} target`),
    relation: nonBlank(item.relation, `connection ${String(index)} relation`),
    direction,
    label: typeof item.label === 'string' ? item.label : (() => { throw new TypeError(`cohub-board: connection ${String(index)} label must be a string`) })(),
    revision: natural(item.revision, `connection ${String(index)} revision`),
  })
}

/**
 * Parse a Cohub Board manifest stored in a Space file.
 * @param value - Manifest JSON text.
 * @returns The validated Board identity and title.
 */
export function parseBoardManifest(value: string): CohubBoardManifest {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch (error) {
    throw new TypeError('cohub-board: Board manifest must contain valid JSON', { cause: error })
  }
  const item = record(parsed, 'Board manifest')
  if (item.kind !== 'cohub.board.manifest' || item.version !== 1) {
    throw new TypeError('cohub-board: unsupported Board manifest')
  }
  const boardId = nonBlank(item.boardId, 'Board manifest boardId')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boardId)) {
    throw new TypeError('cohub-board: Board manifest boardId must be a UUID')
  }
  return Object.freeze({ kind: 'cohub.board.manifest', version: 1, boardId, title: nonBlank(item.title, 'Board manifest title') })
}

function parseSnapshot(value: unknown, spaceId: string, boardId: string): CohubBoardSnapshot {
  const body = record(value, 'Board response')
  const board = parseBoard(body.board, spaceId, boardId)
  const nodeIds = new Set<string>()
  const nodes = array(body.nodes, 'nodes').map((value, index) => {
    const node = parseNode(value, boardId, index)
    if (nodeIds.has(node.nodeId)) throw new TypeError(`cohub-board: duplicate node id "${node.nodeId}"`)
    nodeIds.add(node.nodeId)
    return node
  })
  const connectionIds = new Set<string>()
  const connections = array(body.connections, 'connections').map((value, index) => {
    const connection = parseConnection(value, boardId, index)
    if (connectionIds.has(connection.id)) throw new TypeError(`cohub-board: duplicate connection id "${connection.id}"`)
    connectionIds.add(connection.id)
    if (!nodeIds.has(connection.source.nodeId) || !nodeIds.has(connection.target.nodeId)) {
      throw new TypeError(`cohub-board: connection "${connection.id}" references a missing node`)
    }
    return connection
  })
  return Object.freeze({ board, nodes: Object.freeze(nodes), connections: Object.freeze(connections) })
}

async function responseData(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) { await response.text().catch(() => ''); return undefined }
  try { return await response.json() } catch (error) {
    throw new Error(`cohub-board: HTTP ${String(response.status)} returned invalid JSON`, { cause: error })
  }
}

function apiErrorMessage(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'request failed'
  const body = value as Record<string, unknown>
  return typeof body.message === 'string' && body.message.trim() ? body.message : 'request failed'
}

/** The only capability is exact, authenticated Board inspection. */
export class CohubBoardGateway extends TypertRemoteService {
  static inject = ['cohubAccount']
  static Config: z<Config> = z.object({ apiBaseUrl: z.string().default(DEFAULT_COHUB_API_BASE_URL) })
  private readonly apiBaseUrl: string
  private readonly lifetime = new AbortController()
  private readonly active = new Set<Promise<unknown>>()
  private closed = false

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'cohubBoard')
    this.apiBaseUrl = normalizeUrl(config.apiBaseUrl ?? DEFAULT_COHUB_API_BASE_URL)
  }

  *[Service.init](): Generator<() => Promise<void>, void, void> {
    yield async () => {
      this.closed = true
      this.lifetime.abort(new Error('cohub-board: service disposed'))
      await Promise.allSettled([...this.active])
    }
  }

  /**
   * Read one authenticated Cohub Board with its nodes and connections.
   * @param spaceId - Owning Cohub Space id.
   * @param boardId - Board id within that Space.
   * @returns The validated Board snapshot.
   * @throws When ids are invalid, authentication fails, Cohub rejects the request, or the service is disposed.
   */
  @Remote('getBoard')
  getBoard(spaceId: string, boardId: string): Promise<CohubBoardSnapshot> {
    const promise = this.getBoardImpl(spaceId, boardId)
    this.assertOpen()
    this.active.add(promise)
    void promise.finally(() => { this.active.delete(promise) }).catch(() => {})
    return promise
  }

  private async getBoardImpl(spaceIdValue: string, boardIdValue: string): Promise<CohubBoardSnapshot> {
    const spaceId = nonBlank(spaceIdValue, 'spaceId')
    const boardId = nonBlank(boardIdValue, 'boardId')
    this.assertOpen()
    const token = await this.ctx.cohubAccount.getAccessToken()
    this.assertOpen()
    const params = new URLSearchParams()
    params.append('include', 'nodes')
    params.append('include', 'connections')
    const response = await fetch(`${this.apiBaseUrl}/api/spaces/${encodeURIComponent(spaceId)}/board/${encodeURIComponent(boardId)}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: this.lifetime.signal,
    })
    const data = await responseData(response)
    if (!response.ok) throw new CohubBoardHttpError(response.status, apiErrorMessage(data))
    return parseSnapshot(data, spaceId, boardId)
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('cohub-board: service is disposed')
  }
}

export default CohubBoardGateway
