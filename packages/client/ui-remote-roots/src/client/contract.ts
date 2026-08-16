import type { PropsLocale, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  RemoteDirectoryListing, RemoteResourceId, RemoteRootSourceId, RemoteRootsSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'

export interface RemoteRootTreeInjected {
  readonly hooks: { readonly remoteRoots: import('@deepseek-ai/dsh-client-ui-slots').HostObservable<RemoteRootsSnapshot> }
  list(sourceId: RemoteRootSourceId, request: {
    readonly rootId: RemoteResourceId
    readonly parentId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteDirectoryListing>
}

export type RemoteRootTreeProps = Omit<RemoteRootTreeInjected, 'hooks'> & {
  readonly useRemoteRoots: SnapshotSelectorHook<RemoteRootsSnapshot>
} & PropsLocale<'remoteRoots'>
