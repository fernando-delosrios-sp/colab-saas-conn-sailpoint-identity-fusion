// ============================================================================
// Type Definitions — Fusion Report
// ============================================================================

/** Individual attribute score within a fusion report match comparison. */
export type FusionReportScore = {
    /** The attribute name that was compared */
    attribute: string
    /** The algorithm used for comparison (e.g. "jaro-winkler", "name-matcher") */
    algorithm?: string
    /** The calculated similarity score (0-1) */
    score: number
    /** The configured threshold for this attribute */
    fusionScore?: number
    /** Whether the score met or exceeded the threshold */
    isMatch: boolean
    /** Human-readable explanation of the score result */
    comment?: string
}

/** A single identity match candidate within a fusion report account. */
export type FusionReportMatch = {
    /** Display name of the matched identity */
    identityName: string
    /** ISC identity ID */
    identityId?: string
    /** Direct URL to the identity in the ISC UI */
    identityUrl?: string
    /** Whether this candidate is considered a match overall */
    isMatch: boolean
    /** Per-attribute score breakdown */
    scores?: FusionReportScore[]
}

/** A single account entry in the fusion report, with its match candidates. */
export type FusionReportAccount = {
    /** Display name of the source account */
    accountName: string
    /** Name of the source the account belongs to */
    accountSource: string
    /** Source processing type (authoritative, record, or orphan) */
    sourceType?: 'authoritative' | 'record' | 'orphan'
    /** ISC account ID */
    accountId?: string
    /** Email address from the account attributes */
    accountEmail?: string
    /** Subset of account attributes included in the report */
    accountAttributes?: Record<string, any>
    /** List of identity match candidates with their scores */
    matches: FusionReportMatch[]
    /** Error message when form creation failed (excessive candidates or runtime error) */
    error?: string
}

/** Processing statistics included in the fusion report. */
/**
 * Snapshot values only available from the aggregation orchestrator.
 * Passed to generateReport so it can build the full FusionReportStats.
 */
export type AggregationStats = {
    identitiesFound: number
    managedAccountsFound: number
    managedAccountsFoundAuthoritative?: number
    managedAccountsFoundRecord?: number
    managedAccountsFoundOrphan?: number
    totalProcessingTime: string
}

export type FusionReportStats = {
    /** Total fusion accounts (existing + new) */
    totalFusionAccounts?: number
    /** Number of fusion review forms created */
    fusionReviewsCreated?: number
    /** Number of fusion review assignments (form instances, one per reviewer) */
    fusionReviewAssignments?: number
    /** Number of "new identity" decisions from reviews */
    fusionReviewNewIdentities?: number
    /** Number of non-match decisions from reviews */
    fusionReviewNonMatches?: number
    /** Number of ISC identities loaded */
    identitiesFound?: number
    /** Number of managed source accounts loaded */
    managedAccountsFound?: number
    /** Number of managed source accounts loaded from authoritative sources */
    managedAccountsFoundAuthoritative?: number
    /** Number of managed source accounts loaded from record sources */
    managedAccountsFoundRecord?: number
    /** Number of managed source accounts loaded from orphan sources */
    managedAccountsFoundOrphan?: number
    /** Number of managed source accounts processed */
    managedAccountsProcessed?: number
    /** Number of managed source accounts processed from authoritative sources */
    managedAccountsProcessedAuthoritative?: number
    /** Number of managed source accounts processed from record sources */
    managedAccountsProcessedRecord?: number
    /** Number of managed source accounts processed from orphan sources */
    managedAccountsProcessedOrphan?: number
    /** Number of fusion review decisions by source type */
    fusionReviewDecisionsAuthoritative?: number
    fusionReviewDecisionsRecord?: number
    fusionReviewDecisionsOrphan?: number
    /** Source-type-specific decision outcomes */
    fusionReviewNewIdentitiesAuthoritative?: number
    fusionReviewNoMatchesRecord?: number
    fusionReviewNoMatchesOrphan?: number
    /** Formatted total processing time */
    totalProcessingTime?: string
    /** Formatted memory usage at report generation time */
    usedMemory?: string
}

/**
 * Complete fusion report generated during aggregation or on-demand.
 * Contains all analyzed accounts and their deduplication match results.
 */
export type FusionReport = {
    /** Array of accounts analyzed in this report */
    accounts: FusionReportAccount[]
    /** Total number of accounts analyzed */
    totalAccounts?: number
    /** Number of accounts flagged as potential duplicates */
    potentialDuplicates?: number
    /** Timestamp when the report was generated */
    reportDate?: Date | string
    /** Processing statistics */
    stats?: FusionReportStats
}
