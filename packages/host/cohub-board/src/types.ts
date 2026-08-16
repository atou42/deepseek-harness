/** Client-safe wire vocabulary for the read-only Cohub Board adapter. */

import type { JsonValue } from '@deepseek-ai/dsh-session/types'

export interface CohubBoardManifest {
  readonly kind: 'cohub.board.manifest'
  readonly version: 1
  readonly boardId: string
  readonly title: string
}

export interface CohubBoardRecord {
  readonly id: string
  readonly spaceId: string
  readonly title: string
  readonly version: number
  readonly metadata: Readonly<Record<string, JsonValue>>
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

export interface CohubBoardNode {
  readonly boardId: string
  readonly nodeId: string
  readonly type: string
  readonly parentId: string | null
  readonly orderKey: string | null
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
  readonly refKind: string | null
  readonly refPath: string | null
  readonly refUrl: string | null
  readonly view: Readonly<Record<string, JsonValue>>
  readonly style: Readonly<Record<string, JsonValue>>
  readonly data: Readonly<Record<string, JsonValue>>
  readonly version: number
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

export interface CohubBoardEndpoint {
  readonly nodeId: string
}

export interface CohubBoardConnection {
  readonly id: string
  readonly boardId: string
  readonly source: CohubBoardEndpoint
  readonly target: CohubBoardEndpoint
  readonly relation: string
  readonly direction: 'none' | 'forward' | 'backward' | 'both'
  readonly label: string
  readonly revision: number
}

export interface CohubBoardSnapshot {
  readonly board: CohubBoardRecord
  readonly nodes: readonly CohubBoardNode[]
  readonly connections: readonly CohubBoardConnection[]
}
