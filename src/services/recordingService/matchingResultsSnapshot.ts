import type { FusionReportAccount } from '../fusionService/types'

export interface MatchingResultsSweepSummary {
    processed?: number
    exact?: number
    partial?: number
    deferred?: number
    nonMatch?: number
}

/** Per-operation matching outcomes persisted under `reports/matching-results.json`. */
export interface MatchingResultsSnapshot {
    version: '1.0.0'
    recordedAt: string
    operation: string
    stepId?: string
    sweepSummary?: MatchingResultsSweepSummary
    identityMatches: FusionReportAccount[]
    deferredMatches: FusionReportAccount[]
    nonMatches: FusionReportAccount[]
    failedMatches: FusionReportAccount[]
}
