/** Client-safe wire vocabulary for the Cohub Space/files adapter. */

/** One Cohub Space rendered as a remote semantic root. */
export interface CohubSpaceView {
  readonly id: string
  readonly title: string
}

/** One Cohub conversation shown beneath its owning Space. */
export interface CohubSessionView {
  readonly id: string
  readonly spaceId: string
  readonly title: string
  readonly status: string
  readonly latestMessageText?: string
  readonly updatedAt: string
}

/** Complete Session listing for one Space. */
export interface CohubSpaceSessionList {
  readonly spaceId: string
  readonly sessions: readonly CohubSessionView[]
}

/** One Cohub Turn projected into the provider-neutral conversation view. */
export interface CohubTurnView {
  readonly id: string
  readonly sessionId: string
  readonly sequence: number
  readonly status: string
  readonly userText?: string
  readonly assistantText?: string
  readonly errorMessage?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Complete currently available conversation history for one Cohub Session. */
export interface CohubConversationView {
  readonly spaceId: string
  readonly session: CohubSessionView
  readonly turns: readonly CohubTurnView[]
}

/** One native Cohub Agent Turn accepted by the platform. */
export interface CohubPromptSubmission {
  readonly spaceId: string
  readonly session: CohubSessionView
  readonly turn: CohubTurnView
}

/** Confirmation that Cohub accepted an abort for one native Agent Turn. */
export interface CohubAbortTurnResult {
  readonly ok: true
  readonly spaceId: string
  readonly sessionId: string
  readonly turnId: string
}

/** One ordinary DSH Session bound to a Cohub Space. */
export interface CohubDshSessionBinding {
  readonly spaceId: string
  readonly spaceTitle: string
  readonly dshSessionId: string
}

/** Local DSH working directory selected before a Cohub-bound Session is created. */
export interface CohubDshSessionStart {
  readonly spaceId: string
  readonly cwd: string
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
    /**
     * The account state changed; browser-side Space sources should refresh.
     * @mode emit
     */
    'cohub-spaces/changed'(): void
  }
}
