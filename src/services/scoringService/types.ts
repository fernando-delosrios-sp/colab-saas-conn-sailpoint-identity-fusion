import { FusionAccount } from '../../model/account'
import { MatchingConfig } from '../../model/config'

// ============================================================================
// Type Definitions — Scoring
// ============================================================================

/**
 * Result of scoring a single attribute comparison. Extends the matching config
 * with the calculated score and match result.
 */
export type ScoreReport = MatchingConfig & {
    /** Raw algorithm similarity (0-100) */
    score: number
    /** Weighted partial toward the combined score: (blendWeight/Σw)×raw; sums to combined for evaluated rules */
    weightedScore?: number
    /** Whether the score met or exceeded the configured threshold */
    isMatch: boolean
    /** When true, the rule was not scored (e.g. skip-on-missing); excluded from combined score */
    skipped?: boolean
    /** Human-readable description of the score result */
    comment?: string
}

/**
 * A match between a fusion account and an existing fusion identity,
 * including the per-attribute score breakdown that led to the match.
 *
 * Memory: identityId and identityName are stored so fusionIdentity can be cleared
 * after form creation, reducing retention of full FusionAccount references.
 */
export type FusionMatch = {
    /** The existing fusion identity (cleared after form creation to reduce retention) */
    fusionIdentity?: FusionAccount
    /** Identity ID for report and lookups - always present */
    identityId: string
    /** Display name for report - always present */
    identityName: string
    /** Candidate origin used by downstream workflow routing. */
    candidateType?: 'identity' | 'new-unmatched'
    /** Score reports for each matching rule evaluated */
    scores: ScoreReport[]
}
