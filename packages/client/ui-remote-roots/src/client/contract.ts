import type { PropsLocale, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  RemoteConversationPromptResult, RemoteConversationView, RemoteDirectoryListing,
  RemoteResourceId, RemoteRootSourceId, RemoteRootsSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'

export interface RemoteRootTreeInjected {
  readonly hooks: { readonly remoteRoots: import('@deepseek-ai/dsh-client-ui-slots').HostObservable<RemoteRootsSnapshot> }
  list(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly parentId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteDirectoryListing>
  activate(
    sourceId: RemoteRootSourceId,
    rootId: RemoteResourceId,
    sessionId?: RemoteResourceId,
    sessionTitle?: string,
  ): void
}

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
  }): Promise<RemoteConversationView>
  promptConversation(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly sessionId?: RemoteResourceId
    readonly text: string
  }): Promise<RemoteConversationPromptResult>
}

/** Render props for the selected remote conversation. */
export type RemoteConversationOverlayProps = Omit<RemoteConversationOverlayInjected, 'hooks'> & {
  readonly useRemoteRoots: SnapshotSelectorHook<RemoteRootsSnapshot>
} & PropsLocale<'remoteRoots'>
