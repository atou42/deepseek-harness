/** Media kinds accepted and returned by Cohub generation. */
export type GenerationMediaType = 'image' | 'video' | 'audio'

/** One advertised Cohub generation model. */
export interface CohubGenerationModel {
  readonly model: string
  readonly title: string
  readonly description?: string
  readonly hidden: boolean
  readonly inputTypes: readonly ('text' | GenerationMediaType)[]
  readonly parametersJson: string
  readonly metaJson?: string
}

/** Public URL reference supplied to a generation model. */
export interface CohubGenerationReference {
  readonly type: GenerationMediaType
  readonly url: string
  readonly role?: string
}

/** Generated image persisted through the DSH attachment store. */
export interface CohubGeneratedImageAttachment {
  readonly attachmentId: string
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly name?: string
}

/** One validated text or media output from a Cohub generation task. */
export type CohubGenerationOutput =
  | { readonly type: 'text'; readonly text: string; readonly role?: string }
  | {
    readonly type: GenerationMediaType
    readonly url?: string
    readonly role?: string
    readonly attachment?: CohubGeneratedImageAttachment
    readonly attachmentWarning?: string
  }

/** Cohub billing record returned with a completed generation. */
export interface CohubGenerationBilling {
  readonly amountUsd: number
  readonly officialCostUsd?: number
  readonly discountMultiplier?: number
  readonly usageType: string
  readonly status: 'recorded' | 'overage' | 'skipped'
  readonly reason?: string | null
}

/** Completed Cohub generation result. */
export interface CohubGenerationResult {
  readonly taskRunId: string
  readonly status: 'completed'
  readonly model: string
  readonly output: readonly CohubGenerationOutput[]
  readonly requestId?: string
  readonly cost?: number
  readonly billing?: CohubGenerationBilling | null
}

/** Current state of a Cohub generation task. */
export type CohubGenerationTaskStatus =
  | { readonly taskRunId: string; readonly status: 'pending' | 'running'; readonly progressJson?: string }
  | { readonly taskRunId: string; readonly status: 'failed'; readonly errorMessage: string; readonly progressJson?: string }
  | (CohubGenerationResult & { readonly progressJson?: string })
