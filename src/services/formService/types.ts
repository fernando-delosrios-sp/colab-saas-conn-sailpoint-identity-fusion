// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Candidate identity structure for form building
 */
export type Candidate = {
    id: string
    name: string
    attributes: Record<string, any>
    scores: any[]
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
