// ============================================================================
// Type Definitions
// ============================================================================

export type Score = {
    attribute?: string
    score?: number
    fusionScore?: number
    weightedScore?: number
    skipped?: boolean
    algorithm?: string
}

/**
 * Candidate identity structure for form building
 */
export type Candidate = {
    id: string
    name: string
    attributes: Record<string, any>
    scores: Score[]
}

export type PendingReviewFormContext = {
    formInstanceId: string
    url?: string
}

export type PendingReviewReviewerContext = {
    id: string
    name: string
    email: string
}

export type PendingReviewAccountContext = {
    forms: PendingReviewFormContext[]
    reviewers: PendingReviewReviewerContext[]
    candidateIds: string[]
}

/** Result of `FormService.createFusionForm` for reporting and duplicate-review handling. */
export type CreateFusionFormOutcome = {
    /** True when a form definition was resolved and candidate IDs were registered for this run. */
    formDefinitionReady: boolean
    /** How many reviewers had a new form instance creation queued (async); 0 when all were skipped or ineligible. */
    newReviewInstancesQueued: number
}
