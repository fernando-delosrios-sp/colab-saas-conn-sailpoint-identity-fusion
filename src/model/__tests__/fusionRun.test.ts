import { describe, it, expect } from 'vitest'
import { FusionRun } from '../fusionRun'

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
    })

    it('allows reading and writing managed accounts', () => {
        const run = new FusionRun()
        const account = { name: 'test', sourceName: 'SourceA', nativeIdentity: 'ni-1' }
        run.managedAccountsById.set('src-a::ni-1', account as any)
        expect(run.managedAccountsById.get('src-a::ni-1')).toBe(account)
    })

    it('tracks auto-assigned identity IDs', () => {
        const run = new FusionRun()
        run.autoAssignedIdentityIds.add('id-1')
        run.autoAssignedIdentityIds.add('id-2')
        expect(run.autoAssignedIdentityIds.has('id-1')).toBe(true)
        expect(run.autoAssignedIdentityIds.has('id-2')).toBe(true)
        expect(run.autoAssignedIdentityIds.has('id-3')).toBe(false)
    })

    it('snapshot returns serializable state', () => {
        const run = new FusionRun()
        run.managedAccountsById.set('k1', { name: 'a1' } as any)
        run.fusionAccountMap.set('k2', { name: 'fa1' } as any)
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
        run.autoAssignedIdentityIds.add('id-a')
        run.autoAssignedIdentityIds.add('id-b')

        const snap = run.snapshot()
        expect(snap.autoAssignedIds).toEqual(expect.arrayContaining(['id-a', 'id-b']))
    })

    it('snapshot captures form processing state', () => {
        const run = new FusionRun()
        run.fusionIdentityDecisions = [{ account: { id: 'a1', name: 'test', sourceName: 's1' } } as any]
        run.pendingCandidateIdentityIds = new Set(['candidate-1'])
        run.pendingReviewUrlsByReviewerId = new Map([['r1', ['url1']]])

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
})
