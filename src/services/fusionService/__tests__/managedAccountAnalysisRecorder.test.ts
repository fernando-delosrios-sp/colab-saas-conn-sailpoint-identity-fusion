import { describe, it, expect, vi } from 'vitest'
import { AggregationTracker } from '../aggregationTracker'
import { ManagedAccountAnalysisRecorder } from '../managedAccountAnalysisRecorder'
import { SourceType } from '../../../model/config'
import { MatchCandidateType } from '../../scoringService/types'

function makeRecorder(overrides: Record<string, any> = {}) {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const tracker = new AggregationTracker()
    const urlContext = {
        identity: vi.fn(() => 'identity-url'),
        humanAccount: vi.fn(() => 'human-url'),
    } as any
    const analyzer = {
        isDeferredMatchingEnabledForSource: vi.fn(() => false),
        isRecordMatchingEnabledForSource: vi.fn(() => true),
    } as any
    const sources = { resolveIscAccountIdForManagedKey: vi.fn(() => 'isc-123') } as any
    return {
        recorder: new ManagedAccountAnalysisRecorder({
            log,
            tracker: () => tracker,
            urlContext,
            reportAttributes: [],
            sourcesByName: new Map(),
            config: { fusionReportOnAggregation: true } as any,
            analyzer,
            sources,
            shouldCaptureReportData: () => true,
            ...overrides,
        }),
        log,
        tracker,
        urlContext,
        analyzer,
        sources,
    }
}

describe('ManagedAccountAnalysisRecorder', () => {
    it('records a match account', () => {
        const { recorder, tracker } = makeRecorder()
        const fusionAccount = {
            isMatch: true,
            fusionMatches: [
                { candidateType: 'identity', identityId: 'id-1', identityName: 'Jane', scores: [] },
            ],
        } as any
        recorder.recordAnalysis({
            account: { name: 'acct', sourceName: 'HR' } as any,
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            hasIdentityCandidateMatches: true,
            fusionIdentityComparisons: 5,
        })
        expect(tracker.matchAccounts).toContain(fusionAccount)
        expect(tracker.fusionIdentityComparisonsByAccount.get(fusionAccount)).toBe(5)
    })

    it('records a deferred match account', () => {
        const { recorder, tracker } = makeRecorder()
        const fusionAccount = {
            name: 'acct',
            sourceName: 'HR',
            isMatch: true,
            fusionMatches: [
                { candidateType: MatchCandidateType.Deferred, identityName: 'Jane', scores: [] },
            ],
        } as any
        recorder.recordAnalysis({
            account: { name: 'acct', sourceName: 'HR' } as any,
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            hasIdentityCandidateMatches: false,
            fusionIdentityComparisons: 3,
        })
        expect(tracker.deferredMatchReportData.length).toBe(1)
        expect(tracker.deferredMatchReportData[0].deferred).toBe(true)
    })

    it('skips non-match data for authoritative deferred sources', () => {
        const { recorder, tracker, analyzer } = makeRecorder()
        analyzer.isDeferredMatchingEnabledForSource.mockReturnValue(true)
        const fusionAccount = { name: 'acct', sourceName: 'HR', isMatch: false } as any
        recorder.recordAnalysis({
            account: { name: 'acct', sourceName: 'HR' } as any,
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            hasIdentityCandidateMatches: false,
            fusionIdentityComparisons: 0,
        })
        expect(tracker.analyzedNonMatchReportData.length).toBe(0)
    })

    it('records failed matching', () => {
        const { recorder, tracker } = makeRecorder()
        const fusionAccount = { name: 'acct', sourceName: 'HR' } as any
        recorder.trackFailed(fusionAccount, 'form failed')
        expect(tracker.failedMatchingAccounts.length).toBe(1)
    })
})
