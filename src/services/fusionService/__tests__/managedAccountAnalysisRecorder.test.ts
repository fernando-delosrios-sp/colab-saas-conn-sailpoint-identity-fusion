import { describe, it, expect, vi } from 'vitest'
import { AggregationTracker } from '../aggregationTracker'
import { ManagedAccountAnalysisRecorder } from '../managedAccountAnalysisRecorder'
import { SourceType } from '../../../model/config'
import { MatchCandidateType } from '../../matchingService/types'
import { FusionRun } from '../../../model/fusionRun'

function makeRecorder(overrides: Record<string, any> = {}) {
    const run = overrides.run ?? new FusionRun({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), recordEvent: vi.fn(), getLogLevel: vi.fn().mockReturnValue('info') } as any)
    const log = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        recordEvent: vi.fn(),
        getLogLevel: vi.fn().mockReturnValue('info'),
    } as any
    const tracker = new AggregationTracker()
    const urlContext = {
        identity: vi.fn(() => 'identity-url'),
        humanAccount: vi.fn(() => 'human-url'),
    } as any
    const sources = { resolveIscAccountIdForManagedKey: vi.fn(() => 'isc-123') } as any
    return {
        run,
        recorder: new ManagedAccountAnalysisRecorder({
            log,
            tracker: () => tracker,
            urlContext,
            reportAttributes: [],
            sourcesByName: new Map(),
            config: { fusionReportOnAggregation: true } as any,
            sources,
            run,
            shouldCaptureReportData: () => true,
            ...overrides,
        }),
        log,
        tracker,
        urlContext,
        sources,
    }
}

describe('ManagedAccountAnalysisRecorder', () => {
    it('records a match account', () => {
        const { recorder, tracker, log } = makeRecorder()
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
        expect(log.recordEvent).toHaveBeenCalledWith('match', { type: 'partial' })
    })

    it('records a deferred match account', () => {
        const anchor = {
            managedKey: 'source-a-id::anchor',
            sourceName: 'HR',
            name: 'Jane',
        } as any
        const { recorder, tracker, run } = makeRecorder({
            sourcesByName: new Map([
                ['HR', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } }],
            ]),
        })
        run.registerFinalizedDeferredCandidate(anchor)
        const fusionAccount = {
            name: 'acct',
            sourceName: 'HR',
            isMatch: true,
            fusionMatches: [
                {
                    candidateType: MatchCandidateType.Deferred,
                    identityName: 'Jane',
                    fusionIdentity: anchor,
                    scores: [],
                },
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

    it('uses managed account url for deferred match candidates instead of identity url', () => {
        const { recorder, tracker, urlContext, sources, run } = makeRecorder({
            sourcesByName: new Map([
                ['HR', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } }],
            ]),
        })
        sources.resolveIscAccountIdForManagedKey.mockReturnValue('isc-managed-456')
        const anchorIdentity = {
            identityId: 'identity-999',
            managedAccountId: 'source-a-id::native-candidate',
            managedKeyOrUndefined: 'source-a-id::native-candidate',
            managedKey: 'source-a-id::native-candidate',
            name: 'Jane Candidate',
            sourceName: 'HR',
        } as any
        run.registerFinalizedDeferredCandidate(anchorIdentity)
        const fusionAccount = {
            name: 'acct',
            sourceName: 'HR',
            isMatch: true,
            fusionMatches: [
                {
                    candidateType: MatchCandidateType.Deferred,
                    identityName: 'Jane Candidate',
                    fusionIdentity: anchorIdentity,
                    scores: [],
                },
            ],
        } as any
        recorder.recordAnalysis({
            account: { name: 'acct', sourceName: 'HR' } as any,
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            hasIdentityCandidateMatches: false,
            fusionIdentityComparisons: 2,
        })
        const matchRow = tracker.deferredMatchReportData[0].matches[0]
        expect(matchRow.accountId).toBe('source-a-id::native-candidate')
        expect(matchRow.identityUrl).toBe('human-url')
        expect(urlContext.humanAccount).toHaveBeenCalledWith('isc-managed-456')
        expect(urlContext.identity).not.toHaveBeenCalled()
    })


    it('excludes pending peer matches from deferred report candidates', () => {
        const peer = {
            managedKey: 'source-a-id::peer',
            sourceName: 'HR',
            name: 'Peer',
        } as any
        const anchor = {
            managedKey: 'source-a-id::anchor',
            sourceName: 'HR',
            name: 'Anchor',
        } as any
        const { recorder, tracker, run } = makeRecorder({
            sourcesByName: new Map([
                ['HR', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } }],
            ]),
        })
        run.registerFinalizedDeferredCandidate(anchor)
        const fusionAccount = {
            name: 'acct',
            sourceName: 'HR',
            isMatch: true,
            fusionMatches: [
                {
                    candidateType: MatchCandidateType.Deferred,
                    identityName: 'Anchor',
                    fusionIdentity: anchor,
                    scores: [],
                },
                {
                    candidateType: MatchCandidateType.Deferred,
                    identityName: 'Peer',
                    fusionIdentity: peer,
                    scores: [],
                },
            ],
        } as any
        recorder.recordAnalysis({
            account: { name: 'acct', sourceName: 'HR' } as any,
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            hasIdentityCandidateMatches: false,
            fusionIdentityComparisons: 2,
        })
        expect(tracker.deferredMatchReportData[0].matches).toHaveLength(1)
        expect(tracker.deferredMatchReportData[0].matches[0].identityName).toBe('Anchor')
    })

    it('skips non-match data for authoritative deferred sources', () => {
        const sourcesByName = new Map([
            ['HR', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } }],
        ])
        const { recorder, tracker } = makeRecorder({ sourcesByName })
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



