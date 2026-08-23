import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  RemoteConversationAbortResult, RemoteConversationModelCatalog, RemoteConversationSelection,
  RemoteConversationSubmission, RemoteConversationView, RemoteDirectoryListing,
  RemoteResourceId, RemoteRootSource, RemoteRootSourceId,
  RemoteRootsSnapshot, RemoteTextFile, RemoteTextWriteResult,
} from '../types.ts'

/** Public client face. Providers register through their own Cordis fiber. */
export interface RemoteRootsServiceContract {
  readonly snapshot: ObservableSnapshot<RemoteRootsSnapshot>
  register(source: RemoteRootSource): () => void
  list(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly parentId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteDirectoryListing>
  read(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteTextFile>
  write(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly content: string
    readonly ifRevision: string
    readonly signal?: AbortSignal
  }): Promise<RemoteTextWriteResult>
  startWorkspace(sourceId: RemoteRootSourceId, rootId: RemoteResourceId): Promise<void>
  openConversation(
    sourceId: RemoteRootSourceId,
    rootId: RemoteResourceId,
    sessionId?: RemoteResourceId,
    sessionTitle?: string,
  ): Promise<void>
  deactivate(): void
  readConversation(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly sessionId?: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationView>
  listConversationModels(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationModelCatalog>
  sendConversationMessage(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly sessionId?: RemoteResourceId
    readonly content: string
    readonly clientMessageId: string
    readonly selection?: RemoteConversationSelection
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationSubmission>
  abortConversationTurn(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly sessionId: RemoteResourceId
    readonly turnId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationAbortResult>
}
