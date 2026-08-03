import type { MatchingResultsSnapshot } from './matchingResultsSnapshot'

/** Accumulated matching-results artifact written under `reports/matching-results.json`. */
export interface MatchingResultsRecording {
    version: '1.1.0'
    runs: MatchingResultsSnapshot[]
}

/** One aggregation report capture from an account-list epilogue. */
export interface AggregationReportRun {
    stepId?: string
    recordedAt: string
    report: Record<string, unknown>
}

/** Accumulated aggregation artifact written under `reports/aggregation.json`. */
export interface AggregationReportRecording {
    version: '1.1.0'
    runs: AggregationReportRun[]
}

export function isMatchingResultsRecording(value: unknown): value is MatchingResultsRecording {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as MatchingResultsRecording).version === '1.1.0' &&
        Array.isArray((value as MatchingResultsRecording).runs)
    )
}

export function isAggregationReportRecording(value: unknown): value is AggregationReportRecording {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as AggregationReportRecording).version === '1.1.0' &&
        Array.isArray((value as AggregationReportRecording).runs)
    )
}

export function loadMatchingResultsRecording(raw: unknown): MatchingResultsRecording {
    if (isMatchingResultsRecording(raw)) {
        return raw
    }
    if (typeof raw === 'object' && raw !== null && 'identityMatches' in raw) {
        return { version: '1.1.0', runs: [raw as MatchingResultsSnapshot] }
    }
    return { version: '1.1.0', runs: [] }
}

export function loadAggregationReportRecording(raw: unknown): AggregationReportRecording {
    if (isAggregationReportRecording(raw)) {
        return raw
    }
    if (typeof raw === 'object' && raw !== null && ('stats' in raw || 'accounts' in raw)) {
        return {
            version: '1.1.0',
            runs: [{ recordedAt: new Date().toISOString(), report: raw as Record<string, unknown> }],
        }
    }
    return { version: '1.1.0', runs: [] }
}
