import { describe, it, expect, vi, beforeAll } from 'vitest'
import { FusionAccount } from '../../../model/account'
import { FusionConfig } from '../../../model/config'
import { hydrateCorrelatedManagedAccountIdentities } from '../../accountList'

describe('hydrateCorrelatedManagedAccountIdentities', () => {
    const minimalConfig = {
        sources: [
            { name: 'Source A', id: 'src-a', type: 'authoritative' },
            { name: 'Source B', id: 'src-b', type: 'record' },
        ],
        fusionAccountRefreshThresholdInSeconds: 3600,
        maxHistoryMessages: 50,
        resetAccounts: false,
        resetForms: false,
    } as unknown as FusionConfig

    beforeAll(() => {
        FusionAccount.configure(minimalConfig)
    })

    function buildOrphanManagedAccount(id: string, identityId?: string) {
        return {
            id,
            identityId,
            uncorrelated: false,
            sourceId: id.split('::')[0],
            nativeIdentity: id.split('::')[1],
        }
    }

    it('returns zero and calls nothing when no orphan correlated accounts have an identityId', async () => {
        const hydrate = vi.fn().mockResolvedValue(undefined)
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: [],
            hydrateMissingIdentitiesById: hydrate,
        })
        expect(hydrate).not.toHaveBeenCalled()
        expect(result).toEqual({ hydrated: 0 })
    })

    it('skips uncorrelated managed accounts even when they have an identityId', async () => {
        const hydrate = vi.fn().mockResolvedValue(undefined)
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: [
                { id: 'src-a::a1', identityId: 'id-1', uncorrelated: true },
                { id: 'src-a::a2', identityId: 'id-2', uncorrelated: undefined },
            ],
            hydrateMissingIdentitiesById: hydrate,
        })
        expect(hydrate).not.toHaveBeenCalled()
        expect(result).toEqual({ hydrated: 0 })
    })

    it('hydrates once per distinct identityId from orphan correlated accounts only', async () => {
        const hydrate = vi.fn().mockResolvedValue(undefined)
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: [
                buildOrphanManagedAccount('src-a::a1', 'id-1'),
                buildOrphanManagedAccount('src-a::a2', 'id-1'),
                buildOrphanManagedAccount('src-a::a3', 'id-2'),
                { id: 'src-a::skip', identityId: 'id-3', uncorrelated: true },
            ],
            hydrateMissingIdentitiesById: hydrate,
        })
        expect(hydrate).toHaveBeenCalledTimes(1)
        expect(hydrate).toHaveBeenCalledWith(['id-1', 'id-2'])
        expect(result.hydrated).toBe(2)
    })

    it('does not hydrate identityIds for linked correlated accounts absent from the post-refresh queue', async () => {
        const hydrate = vi.fn().mockResolvedValue(undefined)
        await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: [buildOrphanManagedAccount('src-a::orphan', 'id-orphan')],
            hydrateMissingIdentitiesById: hydrate,
        })
        expect(hydrate).toHaveBeenCalledWith(['id-orphan'])
        expect(hydrate.mock.calls[0][0]).not.toContain('id-linked')
    })

    it('handles many orphan correlated accounts without dropping any identity ids', async () => {
        const N = 120
        const accounts = Array.from({ length: N }, (_, i) =>
            buildOrphanManagedAccount(`src-b::acc-${i}`, `id-${i}`)
        )
        const collectedChunks: string[][] = []
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: accounts,
            hydrateMissingIdentitiesById: vi.fn().mockImplementation(async (ids: string[]) => {
                collectedChunks.push(ids)
            }),
        })
        expect(result.hydrated).toBe(N)
        expect(collectedChunks.length).toBe(1)
        expect(collectedChunks[0].length).toBe(N)
    })
})

