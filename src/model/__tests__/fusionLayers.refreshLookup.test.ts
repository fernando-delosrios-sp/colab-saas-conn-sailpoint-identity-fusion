import { describe, it, expect, beforeAll, vi } from 'vitest'
import { FusionAccount } from '../fusionAccount'
import { FusionConfig } from '../config'
import { FusionRun } from '../fusionRun'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAttribute } from '../../data/schema'
import { StatusEntitlement } from '../statusEntitlement'

describe('FusionLayers previous/missing targeted lookups', () => {
    beforeAll(() => {
        FusionAccount.configure({
            sources: [
                { name: 'Source A', id: 'src-a', type: 'authoritative' },
                { name: 'Source B', id: 'src-b', type: 'record' },
            ],
            fusionAccountRefreshThresholdInSeconds: 3600,
            maxHistoryMessages: 50,
            resetAccounts: false,
            resetForms: false,
        } as unknown as FusionConfig)
    })

    const queueAccount = (sourceId: string, nativeIdentity: string, extras: Record<string, unknown> = {}): Account =>
        ({
            id: `isc-${sourceId}-${nativeIdentity}`,
            sourceId,
            nativeIdentity,
            sourceName: sourceId === 'src-a' ? 'Source A' : 'Source B',
            attributes: {},
            ...extras,
        }) as Account

    it('large queue with few previous keys avoids full scan', () => {
        const matchA = queueAccount('src-a', 'keep-1')
        const matchB = queueAccount('src-b', 'keep-2')
        const acc = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-1',
            id: 'isc-1',
            name: 'Persisted Account',
            sourceName: 'Identity Fusion NG',
            attributes: {
                accounts: ['src-a::keep-1', 'src-b::keep-2'],
            },
        } as unknown as Account)

        const run = new FusionRun()
        run.managedAccountsById.set('src-a::keep-1', matchA)
        run.managedAccountsById.set('src-b::keep-2', matchB)
        for (let i = 0; i < 120; i++) {
            const nativeIdentity = `noise-${i}`
            run.managedAccountsById.set(`src-a::${nativeIdentity}`, queueAccount('src-a', nativeIdentity))
        }

        const entriesSpy = vi.spyOn(run, 'entries')
        const scanned: number[] = []
        acc.addManagedAccountLayer(run, {
            onQueueScan: (entriesExamined) => scanned.push(entriesExamined),
        })

        expect(entriesSpy).not.toHaveBeenCalled()
        expect(acc.accountIds).toContain('src-a::keep-1')
        expect(acc.accountIds).toContain('src-b::keep-2')
        expect(acc.statuses).toContain(StatusEntitlement.Uncorrelated)
        expect(run.managedAccountsById.has('src-a::keep-1')).toBe(false)
        expect(run.managedAccountsById.has('src-b::keep-2')).toBe(false)
        expect(run.managedAccountsById.size).toBe(120)
        expect(scanned[0]).toBe(2)
        expect(scanned[0]).not.toBe(122)
        entriesSpy.mockRestore()
    })

    it('missing key absent from queue is skipped', () => {
        const acc = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-2',
            id: 'isc-2',
            name: 'Persisted Account',
            sourceName: 'Identity Fusion NG',
            attributes: {
                [FusionAttribute.MissingAccounts]: ['src-a::gone-1'],
            },
        } as unknown as Account)

        const run = new FusionRun()
        expect(() => acc.addManagedAccountLayer(run)).not.toThrow()
        expect(acc.accountIds).not.toContain('src-a::gone-1')
    })

    it('key in both previous and missing sets blends once', () => {
        const match = queueAccount('src-a', 'both-1')
        const acc = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-3',
            id: 'isc-3',
            name: 'Persisted Account',
            sourceName: 'Identity Fusion NG',
            attributes: {
                accounts: ['src-a::both-1'],
                [FusionAttribute.MissingAccounts]: ['src-a::both-1'],
            },
        } as unknown as Account)

        const run = new FusionRun()
        run.managedAccountsById.set('src-a::both-1', match)
        const claimSpy = vi.spyOn(run, 'claimAccount')
        const scanned: number[] = []

        acc.addManagedAccountLayer(run, {
            onQueueScan: (entriesExamined) => scanned.push(entriesExamined),
        })

        expect(claimSpy).toHaveBeenCalledTimes(1)
        expect(claimSpy).toHaveBeenCalledWith('src-a::both-1', match.identityId)
        expect(acc.accountIds.filter((id) => id === 'src-a::both-1')).toHaveLength(1)
        expect(scanned[0]).toBe(1)
        claimSpy.mockRestore()
    })
})
