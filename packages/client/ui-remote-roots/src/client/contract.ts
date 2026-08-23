import type { PropsLocale, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  RemoteConversationAbortResult, RemoteConversationModelCatalog, RemoteConversationSelection,
  RemoteConversationSubmission, RemoteConversationView, RemoteDirectoryListing,
  RemoteResourceId, RemoteRootSourceId, RemoteRootsSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'

/** Services injected into the remote-root navigation tree. */
export interface RemoteRootTreeInjected {
  readonly hooks: { readonly remoteRoots: import('@deepseek-ai/dsh-client-ui-slots').HostObservable<RemoteRootsSnapshot> }
  list(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly parentId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteDirectoryListing>
  openConversation(
    sourceId: RemoteRootSourceId,
    rootId: RemoteResourceId,
    sessionId?: RemoteResourceId,
    sessionTitle?: string,
  ): Promise<void>
}

/** Render props for the remote-root navigation tree. */
export type RemoteRootTreeProps = Omit<RemoteRootTreeInjected, 'hooks'> & {
  readonly useRemoteRoots: SnapshotSelectorHook<RemoteRootsSnapshot>
} & PropsLocale<'remoteRoots'>

/** Provider-neutral conversation overlay actions. */
export interface RemoteConversationOverlayInjected {
  readonly hooks: { readonly remoteRoots: import('@deepseek-ai/dsh-client-ui-slots').HostObservable<RemoteRootsSnapshot> }
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

/** Render props for the selected remote conversation. */
export type RemoteConversationOverlayProps = Omit<RemoteConversationOverlayInjected, 'hooks'> & {
  readonly useRemoteRoots: SnapshotSelectorHook<RemoteRootsSnapshot>
} & PropsLocale<'remoteRoots'>
