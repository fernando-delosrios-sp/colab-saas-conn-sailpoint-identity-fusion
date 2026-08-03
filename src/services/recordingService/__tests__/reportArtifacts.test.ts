import {
    isAggregationReportRecording,
    isMatchingResultsRecording,
    loadAggregationReportRecording,
    loadMatchingResultsRecording,
} from '../reportArtifacts'
import type { MatchingResultsSnapshot } from '../matchingResultsSnapshot'

describe('reportArtifacts', () => {
    it('wraps legacy matching-results snapshot in runs array', () => {
        const legacy: MatchingResultsSnapshot = {
            version: '1.0.0',
            recordedAt: '2026-07-31T00:00:00.000Z',
            operation: 'accountList',
            identityMatches: [],
            deferredMatches: [],
            nonMatches: [],
            failedMatches: [],
        }
        const loaded = loadMatchingResultsRecording(legacy)
        expect(isMatchingResultsRecording(loaded)).toBe(true)
        expect(loaded.runs).toHaveLength(1)
        expect(loaded.runs[0]).toEqual(legacy)
    })

    it('wraps legacy aggregation report in runs array', () => {
        const legacy = { stats: { managedAccountsFound: 3 }, accounts: [{ accountName: 'A' }] }
        const loaded = loadAggregationReportRecording(legacy)
        expect(isAggregationReportRecording(loaded)).toBe(true)
        expect(loaded.runs).toHaveLength(1)
        expect(loaded.runs[0].report).toEqual(legacy)
    })
})
