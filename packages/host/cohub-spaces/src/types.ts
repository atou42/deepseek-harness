/** Client-safe wire vocabulary for the Cohub Space/files adapter. */

import type { JsonValue } from '@deepseek-ai/dsh-session/types'

/** One Cohub Space rendered as a remote semantic root. */
export interface CohubSpaceView {
  readonly id: string
  readonly title: string
}

/** Thinking strengths accepted by native Cohub Agent prompts. */
export type CohubThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** One text-model route advertised by Cohub. */
export interface CohubModelView {
  readonly provider: string
  readonly id: string
  readonly name: string
  readonly description?: string
}

/** Provider-grouped text-model catalog used by the native composer. */
export interface CohubModelCatalog {
  readonly groups: readonly {
    readonly id: string
    readonly name: string
    readonly models: readonly CohubModelView[]
  }[]
}

/** Optional per-Turn native Cohub Agent model override. */
export interface CohubPromptSelection {
  readonly provider?: string
  readonly model?: string
  readonly thinkingLevel?: CohubThinkingLevel
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

/** One native Cohub message block kept intact for DSH-native presentation. */
export type CohubConversationBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'thinking'; readonly text: string }
  | {
    readonly kind: 'image'
    readonly source:
      | { readonly kind: 'url'; readonly url: string }
      | { readonly kind: 'base64'; readonly mediaType: string; readonly data: string }
  }
  | { readonly kind: 'shell-command'; readonly command: string; readonly rawText: string }
  | { readonly kind: 'tool-use'; readonly id: string; readonly name: string; readonly input: Readonly<Record<string, JsonValue>> }
  | {
    readonly kind: 'tool-result'
    readonly toolUseId: string
    readonly content: string | readonly CohubConversationBlock[]
    readonly isError?: boolean
  }
  | {
    readonly kind: 'system-note'
    readonly noteType: 'session_created' | 'forked' | 'compacted' | 'info'
    readonly text: string
  }

/** One Cohub Turn projected into the provider-neutral conversation view. */
export interface CohubTurnView {
  readonly id: string
  readonly sessionId: string
  readonly sequence: number
  readonly status: string
  readonly userText?: string
  readonly assistantText?: string
  readonly blocks?: readonly CohubConversationBlock[]
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
