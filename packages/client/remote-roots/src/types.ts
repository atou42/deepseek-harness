import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

/** Stable identifier of one independently unloadable remote-root source. */
export type RemoteRootSourceId = string & { readonly __remoteRootSourceId: unique symbol }

/** Provider-owned opaque identity. It is deliberately not a filesystem path. */
export type RemoteResourceId = string & { readonly __remoteResourceId: unique symbol }

/** Visual marker explaining that a root is not a local Workspace directory. */
export interface RemoteRootMarker {
  readonly kind: 'cloud' | 'network' | 'external'
  readonly label: string
}

/** Operations a source can perform for one root. */
export interface RemoteRootCapabilities {
  readonly browse: true
  readonly read: boolean
  readonly write: boolean
}

/** One top-level remote root shown beside, but never converted into, local Workspaces. */
export interface RemoteRootView {
  readonly id: RemoteResourceId
  readonly title: string
  readonly marker: RemoteRootMarker
  readonly capabilities: RemoteRootCapabilities
}

/** Provider publication consumed by the aggregate registry snapshot. */
export type RemoteRootSourceSnapshot =
  | { readonly status: 'loading'; readonly roots: readonly [] }
  | { readonly status: 'ready'; readonly roots: readonly RemoteRootView[] }
  | { readonly status: 'error'; readonly roots: readonly []; readonly message: string }

/** JSON-safe aggregate view exposed to presentation plugins. */
export interface RemoteRootsSnapshot {
  readonly revision: number
  readonly sources: readonly {
    readonly sourceId: RemoteRootSourceId
    readonly status: RemoteRootSourceSnapshot['status']
    readonly roots: readonly RemoteRootView[]
    readonly message?: string
  }[]
}

/** A child entry within a provider-owned root. Parent identities remain opaque. */
export interface RemoteResourceEntry {
  readonly id: RemoteResourceId
  readonly parentId: RemoteResourceId
  readonly name: string
  readonly kind: 'folder' | 'file'
  readonly revision?: string
  readonly size?: number
}

/** One exact directory listing. */
export interface RemoteDirectoryListing {
  readonly rootId: RemoteResourceId
  readonly parentId: RemoteResourceId
  readonly entries: readonly RemoteResourceEntry[]
}

/** Text file content plus the revision required for compare-and-set writes. */
export interface RemoteTextFile {
  readonly rootId: RemoteResourceId
  readonly fileId: RemoteResourceId
  readonly content: string
  readonly revision: string
}

/** Explicit write result. A conflict never masquerades as success. */
export type RemoteTextWriteResult =
  | { readonly ok: true; readonly value: RemoteTextFile }
  | {
    readonly ok: false
    readonly error: {
      readonly code: 'version-conflict'
      readonly current: RemoteTextFile
    }
  }

/** Provider contract. Identity and credentials stay behind these callbacks. */
export interface RemoteRootSource {
  readonly id: RemoteRootSourceId
  readonly snapshot: ObservableSnapshot<RemoteRootSourceSnapshot>
  list(request: {
    readonly rootId: RemoteResourceId
    readonly parentId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteDirectoryListing>
  read?(request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteTextFile>
  write?(request: {
    readonly rootId: RemoteResourceId
    readonly fileId: RemoteResourceId
    readonly content: string
    readonly ifRevision: string
    readonly signal?: AbortSignal
  }): Promise<RemoteTextWriteResult>
}

