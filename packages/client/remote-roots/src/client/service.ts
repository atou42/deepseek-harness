import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {
  RemoteConversationAbortResult, RemoteConversationBlock, RemoteConversationJsonValue,
  RemoteConversationModelCatalog, RemoteConversationSelection,
  RemoteConversationSubmission, RemoteConversationTarget, RemoteConversationView,
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

function jsonValue(value: unknown, field: string): RemoteConversationJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`remote-roots: ${field} must contain finite numbers`)
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${field}[${String(index)}]`))
  const source = record(value, field)
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, jsonValue(item, `${field}.${key}`)]))
}

function jsonRecord(value: unknown, field: string): Readonly<Record<string, RemoteConversationJsonValue>> {
  const source = record(value, field)
  return Object.freeze(Object.fromEntries(Object.entries(source).map(([key, item]) => [key, jsonValue(item, `${field}.${key}`)])))
}

function validateConversationBlocks(value: unknown, field: string): readonly RemoteConversationBlock[] {
  if (!Array.isArray(value)) throw new TypeError(`remote-roots: ${field} must be an array`)
  return Object.freeze(value.map((item, index) => validateConversationBlock(item, `${field}[${String(index)}]`)))
}

function validateConversationBlock(value: unknown, field: string): RemoteConversationBlock {
  const block = record(value, field)
  const kind = nonBlank(block.kind, `${field} kind`)
  switch (kind) {
    case 'text':
    case 'thinking':
      if (typeof block.text !== 'string') throw new TypeError(`remote-roots: ${field} text must be a string`)
      return Object.freeze({ kind, text: block.text })
    case 'image': {
      const source = record(block.source, `${field} source`)
      const sourceKind = nonBlank(source.kind, `${field} source kind`)
      if (sourceKind === 'url') {
        return Object.freeze({ kind: 'image', source: Object.freeze({ kind: 'url', url: nonBlank(source.url, `${field} source url`) }) })
      }
      if (sourceKind === 'base64') {
        return Object.freeze({
          kind: 'image',
          source: Object.freeze({
            kind: 'base64',
            mediaType: nonBlank(source.mediaType, `${field} source mediaType`),
            data: nonBlank(source.data, `${field} source data`),
          }),
        })
      }
      throw new TypeError(`remote-roots: ${field} image source kind "${sourceKind}" is unsupported`)
    }
    case 'shell-command':
      return Object.freeze({
        kind,
        command: nonBlank(block.command, `${field} command`),
        rawText: typeof block.rawText === 'string' ? block.rawText : nonBlank(block.rawText, `${field} rawText`),
      })
    case 'tool-use':
      return Object.freeze({
        kind,
        id: nonBlank(block.id, `${field} id`),
        name: nonBlank(block.name, `${field} name`),
        input: jsonRecord(block.input, `${field} input`),
      })
    case 'tool-result': {
      const content = typeof block.content === 'string'
        ? block.content
        : validateConversationBlocks(block.content, `${field} content`)
      if (block.isError !== undefined && typeof block.isError !== 'boolean') {
        throw new TypeError(`remote-roots: ${field} isError must be a boolean`)
      }
      return Object.freeze({
        kind,
        toolUseId: nonBlank(block.toolUseId, `${field} toolUseId`),
        content,
        ...block.isError === undefined ? {} : { isError: block.isError },
      })
    }
    case 'system-note': {
      const noteType = nonBlank(block.noteType, `${field} noteType`)
      if (!['session_created', 'forked', 'compacted', 'info'].includes(noteType)) {
        throw new TypeError(`remote-roots: ${field} noteType "${noteType}" is unsupported`)
      }
      return Object.freeze({
        kind,
        noteType: noteType as 'session_created' | 'forked' | 'compacted' | 'info',
        text: nonBlank(block.text, `${field} text`),
      })
    }
    default:
      throw new TypeError(`remote-roots: ${field} kind "${kind}" is unsupported`)
  }
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
  if (capabilities.conversation !== undefined
    && capabilities.conversation !== 'read'
    && capabilities.conversation !== 'interactive') {
    throw new TypeError(`remote-roots: source "${sourceId}" capability conversation must be read or interactive`)
  }
  if (capabilities.workspace !== undefined && typeof capabilities.workspace !== 'boolean') {
    throw new TypeError(`remote-roots: source "${sourceId}" capability workspace must be a boolean`)
  }
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
      ...capabilities.workspace === undefined ? {} : { workspace: capabilities.workspace },
      ...capabilities.conversation === undefined ? {} : { conversation: capabilities.conversation },
    }),
  })
}

function validateConversation(
  value: unknown,
  request: { readonly rootId: RemoteResourceId; readonly sessionId?: RemoteResourceId },
): RemoteConversationView {
  const conversation = record(value, 'conversation result')
  if (conversation.rootId !== request.rootId) throw new TypeError('remote-roots: conversation result rootId does not match request')
  if (!Array.isArray(conversation.turns)) throw new TypeError('remote-roots: conversation result turns must be an array')
  let session: RemoteConversationView['session']
  if (conversation.session !== undefined) {
    const item = record(conversation.session, 'conversation result session')
    const id = nonBlank(item.id, 'conversation result session id') as RemoteResourceId
    if (request.sessionId !== undefined && id !== request.sessionId) {
      throw new TypeError('remote-roots: conversation result session id does not match request')
    }
    session = Object.freeze({
      id,
      title: nonBlank(item.title, 'conversation result session title'),
      status: nonBlank(item.status, 'conversation result session status'),
    })
  } else if (request.sessionId !== undefined) {
    throw new TypeError('remote-roots: conversation result omitted the requested session')
  }
  const ids = new Set<string>()
  const turns = conversation.turns.map((value, index) => {
    const turn = record(value, `conversation turn ${String(index)}`)
    const id = nonBlank(turn.id, `conversation turn ${String(index)} id`) as RemoteResourceId
    if (ids.has(id)) throw new TypeError(`remote-roots: conversation result repeats turn "${id}"`)
    ids.add(id)
    if (!Number.isSafeInteger(turn.sequence) || (turn.sequence as number) < 0) {
      throw new TypeError(`remote-roots: conversation turn "${id}" sequence must be a non-negative safe integer`)
    }
    const optional = (item: unknown, field: string): string | undefined => {
      if (item === undefined) return undefined
      if (typeof item !== 'string') throw new TypeError(`remote-roots: ${field} must be a string`)
      return item
    }
    const userText = optional(turn.userText, `conversation turn "${id}" userText`)
    const assistantText = optional(turn.assistantText, `conversation turn "${id}" assistantText`)
    const blocks = turn.blocks === undefined
      ? undefined
      : validateConversationBlocks(turn.blocks, `conversation turn "${id}" blocks`)
    const errorMessage = optional(turn.errorMessage, `conversation turn "${id}" errorMessage`)
    const updatedAt = nonBlank(turn.updatedAt, `conversation turn "${id}" updatedAt`)
    if (!Number.isFinite(Date.parse(updatedAt))) throw new TypeError(`remote-roots: conversation turn "${id}" updatedAt is invalid`)
    return Object.freeze({
      id,
      sequence: turn.sequence as number,
      status: nonBlank(turn.status, `conversation turn "${id}" status`),
      ...userText === undefined ? {} : { userText },
      ...assistantText === undefined ? {} : { assistantText },
      ...blocks === undefined ? {} : { blocks },
      ...errorMessage === undefined ? {} : { errorMessage },
      updatedAt,
    })
  })
  turns.sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
  return Object.freeze({
    rootId: request.rootId,
    ...session === undefined ? {} : { session },
    turns: Object.freeze(turns),
  })
}

function validateSubmission(value: unknown, request: {
  readonly rootId: RemoteResourceId
  readonly sessionId?: RemoteResourceId
}): RemoteConversationSubmission {
  const submission = record(value, 'conversation submission')
  const conversation = validateConversation({
    rootId: submission.rootId,
    session: submission.session,
    turns: [submission.turn],
  }, request)
  if (conversation.session === undefined || conversation.turns[0] === undefined) {
    throw new TypeError('remote-roots: conversation submission omitted its Session or Turn')
  }
  return Object.freeze({
    rootId: request.rootId,
    session: conversation.session,
    turn: conversation.turns[0],
  })
}

function validateModelCatalog(value: unknown): RemoteConversationModelCatalog {
  const catalog = record(value, 'conversation model catalog')
  if (!Array.isArray(catalog.groups)) throw new TypeError('remote-roots: conversation model catalog groups must be an array')
  const groupIds = new Set<string>()
  const routeIds = new Set<string>()
  const groups = catalog.groups.map((rawGroup, groupIndex) => {
    const group = record(rawGroup, `conversation model group ${String(groupIndex)}`)
    const id = nonBlank(group.id, `conversation model group ${String(groupIndex)} id`)
    if (groupIds.has(id)) throw new TypeError(`remote-roots: duplicate conversation model group "${id}"`)
    groupIds.add(id)
    if (!Array.isArray(group.models)) throw new TypeError(`remote-roots: conversation model group "${id}" models must be an array`)
    const models = group.models.map((rawModel, modelIndex) => {
      const model = record(rawModel, `conversation model group "${id}" model ${String(modelIndex)}`)
      const provider = nonBlank(model.provider, `conversation model group "${id}" model ${String(modelIndex)} provider`)
      const modelId = nonBlank(model.id, `conversation model group "${id}" model ${String(modelIndex)} id`)
      const routeId = `${provider}\0${modelId}`
      if (routeIds.has(routeId)) throw new TypeError(`remote-roots: duplicate conversation model route "${provider}/${modelId}"`)
      routeIds.add(routeId)
      const description = model.description === undefined
        ? undefined
        : nonBlank(model.description, `conversation model "${provider}/${modelId}" description`)
      return Object.freeze({
        provider, id: modelId,
        name: nonBlank(model.name, `conversation model "${provider}/${modelId}" name`),
        ...description === undefined ? {} : { description },
      })
    })
    return Object.freeze({
      id,
      name: nonBlank(group.name, `conversation model group "${id}" name`),
      models: Object.freeze(models),
    })
  })
  return Object.freeze({ groups: Object.freeze(groups) })
}

const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

function validateSelection(value: RemoteConversationSelection | undefined): void {
  if (value === undefined) return
  const hasProvider = value.provider !== undefined
  const hasModel = value.model !== undefined
  if (hasProvider !== hasModel) throw new TypeError('remote-roots: conversation selection provider and model must be supplied together')
  if (value.provider !== undefined) nonBlank(value.provider, 'conversation selection provider')
  if (value.model !== undefined) nonBlank(value.model, 'conversation selection model')
  if (value.thinkingLevel !== undefined && !THINKING_LEVELS.has(value.thinkingLevel)) {
    throw new TypeError('remote-roots: conversation selection thinkingLevel is invalid')
  }
}

function validateAbortResult(value: unknown, request: {
  readonly rootId: RemoteResourceId
  readonly sessionId: RemoteResourceId
  readonly turnId: RemoteResourceId
}): RemoteConversationAbortResult {
  const result = record(value, 'conversation abort result')
  if (result.ok !== true) throw new TypeError('remote-roots: conversation abort result ok must be true')
  for (const field of ['rootId', 'sessionId', 'turnId'] as const) {
    if (result[field] !== request[field]) {
      throw new TypeError(`remote-roots: conversation abort result ${field} does not match request`)
    }
  }
  return Object.freeze({ ok: true, rootId: request.rootId, sessionId: request.sessionId, turnId: request.turnId })
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
    if (entry.kind !== 'folder' && entry.kind !== 'file' && entry.kind !== 'link' && entry.kind !== 'session') {
      throw new TypeError(`remote-roots: list entry "${id}" has invalid kind`)
    }
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
  private active: RemoteConversationTarget | undefined
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

  /** Start an ordinary local DSH Session with provider context. */
  async startWorkspace(sourceId: RemoteRootSourceId, rootId: RemoteResourceId): Promise<void> {
    nonBlank(rootId, 'startWorkspace rootId')
    const source = this.requireSource(sourceId)
    const root = this.requireRoot(sourceId, rootId)
    if (root.capabilities.workspace !== true || source.startWorkspace === undefined) {
      throw new Error(`remote-roots: source "${sourceId}" cannot start DSH sessions for root "${rootId}"`)
    }
    await source.startWorkspace({ rootId })
  }

  /** Open a provider-owned conversation without starting a local DSH Agent. */
  openConversation(
    sourceId: RemoteRootSourceId,
    rootId: RemoteResourceId,
    sessionId?: RemoteResourceId,
    sessionTitle?: string,
  ): Promise<void> {
    nonBlank(rootId, 'openConversation rootId')
    if (sessionId !== undefined) nonBlank(sessionId, 'openConversation sessionId')
    const source = this.requireSource(sourceId)
    const root = this.requireRoot(sourceId, rootId)
    if (root.capabilities.conversation === undefined || source.readConversation === undefined) {
      throw new Error(`remote-roots: source "${sourceId}" has no conversations for root "${rootId}"`)
    }
    this.active = Object.freeze({
      sourceId,
      rootId,
      rootTitle: root.title,
      conversation: root.capabilities.conversation,
      ...sessionId === undefined ? {} : { sessionId },
      ...sessionTitle === undefined ? {} : { sessionTitle: nonBlank(sessionTitle, 'activate sessionTitle') },
    })
    this.publish()
    return Promise.resolve()
  }

  /** Close the remote workbench without changing provider state. */
  deactivate(): void {
    if (this.active === undefined) return
    this.active = undefined
    this.publish()
  }

  async readConversation(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly sessionId?: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationView> {
    nonBlank(request.rootId, 'conversation request rootId')
    if (request.sessionId !== undefined) nonBlank(request.sessionId, 'conversation request sessionId')
    const source = this.requireSource(sourceId)
    if (source.readConversation === undefined) throw new Error(`remote-roots: source "${sourceId}" does not support conversations`)
    return validateConversation(await source.readConversation(request), request)
  }

  async listConversationModels(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationModelCatalog> {
    nonBlank(request.rootId, 'conversation model request rootId')
    const source = this.requireSource(sourceId)
    const root = this.requireRoot(sourceId, request.rootId)
    if (root.capabilities.conversation !== 'interactive' || source.listConversationModels === undefined) {
      throw new Error(`remote-roots: source "${sourceId}" has no model catalog for root "${request.rootId}"`)
    }
    return validateModelCatalog(await source.listConversationModels(request))
  }

  async sendConversationMessage(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly sessionId?: RemoteResourceId
    readonly content: string
    readonly clientMessageId: string
    readonly selection?: RemoteConversationSelection
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationSubmission> {
    nonBlank(request.rootId, 'conversation message rootId')
    if (request.sessionId !== undefined) nonBlank(request.sessionId, 'conversation message sessionId')
    nonBlank(request.content, 'conversation message content')
    nonBlank(request.clientMessageId, 'conversation message clientMessageId')
    validateSelection(request.selection)
    const source = this.requireSource(sourceId)
    const root = this.requireRoot(sourceId, request.rootId)
    if (root.capabilities.conversation !== 'interactive' || source.sendConversationMessage === undefined) {
      throw new Error(`remote-roots: source "${sourceId}" conversations are read-only for root "${request.rootId}"`)
    }
    const activeAtStart = this.active
    const submission = validateSubmission(await source.sendConversationMessage(request), request)
    if (activeAtStart !== undefined
      && this.active === activeAtStart
      && activeAtStart.sourceId === sourceId
      && activeAtStart.rootId === request.rootId
      && activeAtStart.sessionId === request.sessionId) {
      this.active = Object.freeze({
        sourceId,
        rootId: request.rootId,
        rootTitle: root.title,
        conversation: 'interactive',
        sessionId: submission.session.id,
        sessionTitle: submission.session.title,
      })
      this.publish()
    }
    return submission
  }

  async abortConversationTurn(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly sessionId: RemoteResourceId
    readonly turnId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationAbortResult> {
    nonBlank(request.rootId, 'conversation abort rootId')
    nonBlank(request.sessionId, 'conversation abort sessionId')
    nonBlank(request.turnId, 'conversation abort turnId')
    const source = this.requireSource(sourceId)
    const root = this.requireRoot(sourceId, request.rootId)
    if (root.capabilities.conversation !== 'interactive' || source.abortConversationTurn === undefined) {
      throw new Error(`remote-roots: source "${sourceId}" conversations cannot abort Turns for root "${request.rootId}"`)
    }
    return validateAbortResult(await source.abortConversationTurn(request), request)
  }

  private requireSource(sourceId: RemoteRootSourceId): RemoteRootSource {
    const source = this.sources.get(sourceId)?.source
    if (source === undefined) throw new Error(`remote-roots: unknown source "${sourceId}"`)
    return source
  }

  private requireRoot(sourceId: RemoteRootSourceId, rootId: RemoteResourceId): RemoteRootsSnapshot['sources'][number]['roots'][number] {
    const published = this.current.sources.find(item => item.sourceId === sourceId)
    const root = published?.status === 'ready' ? published.roots.find(item => item.id === rootId) : undefined
    if (root === undefined) throw new Error(`remote-roots: source "${sourceId}" has no root "${rootId}"`)
    return root
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
      if (this.active !== undefined) {
        const source = sources.find(item => item.sourceId === this.active?.sourceId)
        const root = source?.status === 'ready' ? source.roots.find(item => item.id === this.active?.rootId) : undefined
        if (root === undefined || root.capabilities.conversation === undefined) this.active = undefined
      }
      this.current = Object.freeze({
        revision: this.revision,
        sources,
        ...this.active === undefined ? {} : { active: this.active },
      })
      this.currentFailure = undefined
    } catch (error) {
      this.currentFailure = { error }
      for (const listener of [...this.listeners]) listener()
      throw error
    }
    for (const listener of [...this.listeners]) listener()
  }
}
