/** Client-safe wire vocabulary for the Cohub Space/files adapter. */

/** One Cohub Space rendered as a remote semantic root. */
export interface CohubSpaceView {
  readonly id: string
  readonly title: string
}

/** One immediate child returned by the Cohub filesystem API. */
export interface CohubSpaceEntry {
  readonly path: string
  readonly name: string
  readonly kind: 'folder' | 'file' | 'link'
  readonly size: number
  readonly revision: string
}

/** Exact listing for one Space-relative directory. */
export interface CohubSpaceDirectory {
  readonly spaceId: string
  readonly path: string
  readonly entries: readonly CohubSpaceEntry[]
}

/** Inline UTF-8 content with its compare-and-set revision. */
export interface CohubSpaceTextFile {
  readonly spaceId: string
  readonly path: string
  readonly content: string
  readonly revision: string
}

/** A write either succeeds at a new revision or returns the current file. */
export type CohubSpaceWriteResult =
  | { readonly ok: true; readonly value: CohubSpaceTextFile }
  | {
    readonly ok: false
    readonly error: {
      readonly code: 'version-conflict'
      readonly current: CohubSpaceTextFile
    }
  }

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** The account state changed; browser-side Space sources should refresh. */
    'cohub-spaces/changed'(): void
  }
}
