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
  /** Selecting the root starts an ordinary DSH Session with provider context. */
  readonly workspace?: boolean
  /** The root exposes provider-owned Sessions as read-only history. */
  readonly conversation?: boolean
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
  | { readonly status: 'authentication-required'; readonly roots: readonly []; readonly provider: string }
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
    readonly provider?: string
  }[]
  /** Provider-owned conversation currently occupying the remote workbench. */
  readonly active?: RemoteConversationTarget
}

/** Selected remote Space and optional Session. */
export interface RemoteConversationTarget {
  readonly sourceId: RemoteRootSourceId
  readonly rootId: RemoteResourceId
  readonly rootTitle: string
  readonly sessionId?: RemoteResourceId
  readonly sessionTitle?: string
}

/** One provider-owned remote Turn. */
export interface RemoteConversationTurn {
  readonly id: RemoteResourceId
  readonly sequence: number
  readonly status: string
  readonly userText?: string
  readonly assistantText?: string
  readonly errorMessage?: string
  readonly updatedAt: string
}

/** Conversation history for a selected remote Space or Session. */
export interface RemoteConversationView {
  readonly rootId: RemoteResourceId
  readonly session?: {
    readonly id: RemoteResourceId
    readonly title: string
    readonly status: string
  }
  readonly turns: readonly RemoteConversationTurn[]
}

/** A child entry within a provider-owned root. Parent identities remain opaque. */
export interface RemoteResourceEntry {
  readonly id: RemoteResourceId
  readonly parentId: RemoteResourceId
  readonly name: string
  readonly kind: 'folder' | 'file' | 'link' | 'session'
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
  startWorkspace?(request: {
    readonly rootId: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<void>
  readConversation?(request: {
    readonly rootId: RemoteResourceId
    readonly sessionId?: RemoteResourceId
    readonly signal?: AbortSignal
  }): Promise<RemoteConversationView>
}
