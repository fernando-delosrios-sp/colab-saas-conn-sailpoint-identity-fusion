import { describe, it, expect, vi } from 'vitest'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionRun, RunStateSnapshot } from '../fusionRun'
import { AggregationTracker } from '../aggregationTracker'
import { ManagedAccountAnalysisRecorder } from '../../services/fusionService/managedAccountAnalysisRecorder'
import { SourceInfo } from '../../services/sourceService'
import { SourceType } from '../config'
import { FusionAccount } from '../account'

describe('FusionRun', () => {
    it('initializes with empty maps and sets', () => {
        const run = new FusionRun()
        expect(run.managedAccountsById).toBeInstanceOf(Map)
        expect(run.managedAccountsById.size).toBe(0)
        expect(run.managedAccountsByIdentityId).toBeInstanceOf(Map)
        expect(run.managedAccountsByIdentityId.size).toBe(0)
        expect(run.fusionAccountMap).toBeInstanceOf(Map)
        expect(run.fusionAccountMap.size).toBe(0)
        expect(run.fusionIdentityMap).toBeInstanceOf(Map)
        expect(run.fusionIdentityMap.size).toBe(0)
        expect(run.identityMap).toBeInstanceOf(Map)
        expect(run.identityMap.size).toBe(0)
        expect(run.sourcesByName).toBeInstanceOf(Map)
        expect(run.sourcesByName.size).toBe(0)
        expect(run.autoAssignedIdentityIds).toBeInstanceOf(Set)
        expect(run.autoAssignedIdentityIds.size).toBe(0)
        expect(run.fusionIdentityDecisions.length).toBe(0)
        expect(run.fusionBlends).toEqual([])
        expect(run.matchScoringMs).toBe(0)
        expect(run.pendingDisableOperationsCount).toBe(0)
    })

    describe('isRecordMode from config', () => {
        it('reads isRecordMode from config.recording.mode = "record"', () => {
            const run = new FusionRun(undefined, { recording: { mode: 'record' } } as any)
            expect(run.isRecordMode).toBe(true)
        })

        it('is false for config.recording.mode = "off"', () => {
            const run = new FusionRun(undefined, { recording: { mode: 'off' } } as any)
            expect(run.isRecordMode).toBe(false)
        })

        it('is false for config.recording.mode = "replay"', () => {
            const run = new FusionRun(undefined, { recording: { mode: 'replay' } } as any)
            expect(run.isRecordMode).toBe(false)
        })

        it('is false when config has no recording field', () => {
            const run = new FusionRun(undefined, {} as any)
            expect(run.isRecordMode).toBe(false)
        })

        it('falls back to RECORD_MODE env var when config has no recording.mode', () => {
            process.env.RECORD_MODE = 'true'
            const run = new FusionRun(undefined, {} as any)
            expect(run.isRecordMode).toBe(true)
            delete process.env.RECORD_MODE
        })
    })

    it('allows reading and writing managed accounts', () => {
        const run = new FusionRun()
        const account = { name: 'test', sourceName: 'SourceA', nativeIdentity: 'ni-1' }
        run.managedAccountsById.set('src-a::ni-1', account as any)
        expect(run.managedAccountsById.get('src-a::ni-1')).toBe(account)
    })

    it('tracks auto-assigned identity IDs', () => {
        const run = new FusionRun()
        run.markAutoAssigned('id-1')
        run.markAutoAssigned('id-2')
        expect(run.isAutoAssigned('id-1')).toBe(true)
        expect(run.isAutoAssigned('id-2')).toBe(true)
        expect(run.isAutoAssigned('id-3')).toBe(false)
    })

    describe('disable operations', () => {
        it('queues and awaits pending disable operations', async () => {
            const run = new FusionRun()
            let fired = false
            const account = { name: 'acct', sourceName: 'src' } as Account
            run.setDisableOperationFactory(async () => {
                await new Promise<void>((resolve) => setTimeout(resolve, 10))
                fired = true
            })
            run.queueDisableOperation(account)
            expect(run.pendingDisableOperationsCount).toBe(1)
            await run.awaitPendingDisableOperations()
            expect(fired).toBe(true)
            expect(run.pendingDisableOperationsCount).toBe(0)
        })

        it('removes completed disable operations from the pending set', async () => {
            const run = new FusionRun()
            const account = { name: 'acct', sourceName: 'src' } as Account
            run.setDisableOperationFactory(async () => {})
            run.queueDisableOperation(account)
            await run.awaitPendingDisableOperations()
            expect(run.pendingDisableOperationsCount).toBe(0)
        })

        it('awaitPendingDisableOperations is safe when empty', async () => {
            const run = new FusionRun()
            await expect(run.awaitPendingDisableOperations()).resolves.toBeUndefined()
        })

        it('is a no-op when no factory is registered', () => {
            const run = new FusionRun()
            const account = { name: 'acct', sourceName: 'src' } as Account
            expect(() => run.queueDisableOperation(account)).not.toThrow()
            expect(run.pendingDisableOperationsCount).toBe(0)
        })
    })

    describe('removeMatchAccount', () => {
        it('removes a managed account from the analysis recorder tracker', () => {
            const run = new FusionRun()
            const tracker = new AggregationTracker()
            const fusionAccount = { managedAccountId: 'managed-1' } as FusionAccount
            tracker.matchAccounts.push(fusionAccount)
            run.analysisRecorder = makeMockRecorder({ tracker })

            run.removeMatchAccount('managed-1')
            expect(tracker.matchAccounts).toHaveLength(0)
        })

        it('is a no-op when no recorder is attached', () => {
            const run = new FusionRun()
            expect(() => run.removeMatchAccount('managed-1')).not.toThrow()
        })

        it('is a no-op for undefined ids', () => {
            const run = new FusionRun()
            run.analysisRecorder = makeMockRecorder({ tracker: new AggregationTracker() })
            expect(() => run.removeMatchAccount(undefined)).not.toThrow()
        })

        it('is a no-op when the id is not found', () => {
            const run = new FusionRun()
            const tracker = new AggregationTracker()
            tracker.matchAccounts.push({ managedAccountId: 'managed-1' } as FusionAccount)
            run.analysisRecorder = makeMockRecorder({ tracker })

            run.removeMatchAccount('managed-2')
            expect(tracker.matchAccounts).toHaveLength(1)
        })
    })

    describe('trackFailed', () => {
        it('delegates to the analysis recorder', () => {
            const run = new FusionRun()
            const recorder = makeMockRecorder({ tracker: new AggregationTracker() })
            run.analysisRecorder = recorder
            const fusionAccount = { name: 'fa', sourceName: 's' } as FusionAccount

            run.trackFailed(fusionAccount, 'something went wrong')
            expect(recorder.trackFailedCalls).toEqual([[fusionAccount, 'something went wrong']])
        })

        it('is a no-op when no recorder is attached', () => {
            const run = new FusionRun()
            expect(() => run.trackFailed({} as FusionAccount, 'oops')).not.toThrow()
        })
    })

    it('inventory retains key after claimAccount', () => {
        const run = new FusionRun()
        const account = {
            id: 'isc-1',
            sourceId: 'src-a',
            sourceName: 'Source A',
            nativeIdentity: 'native-1',
            name: 'Test User',
        } as any
        run.setManagedAccount('src-a::native-1', account)
        run.claimAccount('src-a::native-1')

        expect(run.hasManagedAccount('src-a::native-1')).toBe(true)
        expect(run.managedAccountsById.has('src-a::native-1')).toBe(false)
        expect(run.getManagedAccountInfo('src-a::native-1')?.name).toBe('Test User')
    })

    it('snapshot returns serializable state', () => {
        const run = new FusionRun()
        run.managedAccountsById.set('k1', { name: 'a1' } as any)
        ;(run as any)._fusionAccountMap.set('k2', { name: 'fa1' } as any)
        run.matchScoringMs = 1500

        const snap = run.snapshot()
        expect(snap.managedAccounts).toHaveLength(1)
        expect(snap.fusionAccounts).toHaveLength(1)
        expect(snap.matchScoringMs).toBe(1500)
        expect(snap.autoAssignedIds).toEqual([])
        expect(JSON.stringify(snap)).toBeTruthy()
    })

    it('snapshot captures auto-assigned IDs', () => {
        const run = new FusionRun()
        run.markAutoAssigned('id-a')
        run.markAutoAssigned('id-b')

        const snap = run.snapshot()
        expect(snap.autoAssignedIds).toEqual(expect.arrayContaining(['id-a', 'id-b']))
    })

    it('snapshot captures form processing state', () => {
        const run = new FusionRun()
        ;(run as any)._fusionIdentityDecisions = [{ account: { id: 'a1', name: 'test', sourceName: 's1' } } as any]
        ;(run as any)._pendingCandidateIdentityIds = new Set(['candidate-1'])
        ;(run as any)._pendingReviewUrlsByReviewerId = new Map([['r1', ['url1']]])

        const snap = run.snapshot()
        expect(snap.fusionIdentityDecisions.length).toBe(1)
        expect(snap.pendingCandidateIdentityIds).toEqual(['candidate-1'])
        expect(snap.pendingReviewUrlsByReviewerId).toEqual({ r1: ['url1'] })
    })

    it('restore reconstructs state from snapshot', () => {
        const snapshot: RunStateSnapshot = {
            managedAccounts: [{ name: 'a1' }],
            fusionAccounts: [{ name: 'fa1' }],
            identities: [{ id: 'id1', name: 'Identity One' }],
            fusionIdentityDecisions: [],
            pendingCandidateIdentityIds: [],
            pendingReviewUrlsByReviewerId: {},
            pendingReviewUrlsByCandidateId: {},
            sourcesByName: {},
            currentRunNonMatchedKeysBySource: {},
            fusionBlends: [],
            autoAssignedIds: ['id-a'],
            matchScoringMs: 2500,
            phaseTimings: [{ phase: 'Setup', elapsed: '1.2s' }],
        }

        const run = new FusionRun()
        run.restore(snapshot)

        expect(run.managedAccountsById.size).toBe(1)
        expect(run.fusionAccountMap.size).toBe(1)
        expect(run.identityMap.size).toBe(1)
        expect(run.matchScoringMs).toBe(2500)
        expect(run.autoAssignedIdentityIds.has('id-a')).toBe(true)
        expect(run.phaseTimings).toEqual([{ phase: 'Setup', elapsed: '1.2s' }])
    })

    it('restore populates sourcesByName', () => {
        const sourceInfo: SourceInfo = {
            id: 'src-1',
            name: 'Source A',
            isManaged: true,
            sourceType: SourceType.Authoritative,
        }
        const snapshot: RunStateSnapshot = {
            managedAccounts: [],
            fusionAccounts: [],
            identities: [],
            fusionIdentityDecisions: [],
            pendingCandidateIdentityIds: [],
            pendingReviewUrlsByReviewerId: {},
            pendingReviewUrlsByCandidateId: {},
            sourcesByName: { 'Source A': sourceInfo as any },
            currentRunNonMatchedKeysBySource: {},
            fusionBlends: [],
            autoAssignedIds: [],
            matchScoringMs: 0,
            phaseTimings: [],
        }

        const run = new FusionRun()
        run.restore(snapshot)

        expect(run.sourcesByName.get('Source A')).toEqual(sourceInfo)
    })
})

function makeMockRecorder(options: { tracker: AggregationTracker }) {
    const urlContext = {
        humanAccount: vi.fn().mockReturnValue(''),
        identity: vi.fn().mockReturnValue(''),
    }
    const recorder = new ManagedAccountAnalysisRecorder({
        log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), assert: vi.fn(), crash: vi.fn() } as any,
        tracker: () => options.tracker,
        urlContext: urlContext as any,
        reportAttributes: [],
        sourcesByName: new Map(),
        config: {} as any,
        analyzer: {} as any,
        sources: { managedAccountInventory: new Map() } as any,
        shouldCaptureReportData: () => true,
    })
    ;(recorder as any).trackFailedCalls = []
    const originalTrackFailed = recorder.trackFailed.bind(recorder)
    recorder.trackFailed = (fusionAccount: FusionAccount, error: string) => {
        ;(recorder as any).trackFailedCalls.push([fusionAccount, error])
        originalTrackFailed(fusionAccount, error)
    }
    return recorder
}
