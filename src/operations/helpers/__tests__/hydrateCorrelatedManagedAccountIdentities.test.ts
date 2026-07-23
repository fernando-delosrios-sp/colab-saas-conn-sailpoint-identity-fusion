import { describe, it, expect, vi, beforeAll } from 'vitest'
import { IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount } from '../../../model/account'
import { FusionConfig } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'
import { hydrateCorrelatedManagedAccountIdentities } from '../../accountList'

describe('hydrateCorrelatedManagedAccountIdentities', () => {
    const minimalConfig = {
        sources: [
            { name: 'Source A', id: 'src-a', type: 'authoritative' },
            { name: 'Source B', id: 'src-b', type: 'record' },
        ],
        fusionAccountRefreshThresholdInSeconds: 3600,
        maxHistoryMessages: 50,
        reset: false,
    } as unknown as FusionConfig

    beforeAll(() => {
        FusionAccount.configure(minimalConfig)
    })

    function buildManagedAccount(id: string, identityId?: string) {
        return {
            id,
            identityId,
            sourceId: id.split('::')[0],
            nativeIdentity: id.split('::')[1],
        }
    }

    function buildFusionAccountFromManaged(id: string, _identityId?: string): FusionAccount {
        // Pass identityId as null to keep identityInfo undefined on the account
        const acc = FusionAccount.fromManagedAccount(buildManagedAccount(id, null) as any)
        return acc
    }

    function makeIdentity(id: string, opts: { protected?: boolean } = {}): IdentityDocument {
        return {
            id,
            name: 'login',
            displayName: `Display ${id}`,
            attributes: {},
            protected: opts.protected,
        } as any
    }

    it('returns zeros and calls nothing when no managed accounts have an identityId', async () => {
        const hydrate = vi.fn().mockResolvedValue(undefined)
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: [],
            fusionAccounts: [],
            managedAccountsByKey: new Map(),
            getIdentity: vi.fn(),
            hydrateMissingIdentitiesById: hydrate,
        })
        expect(hydrate).not.toHaveBeenCalled()
        expect(result).toEqual({ hydrated: 0, applied: 0 })
    })

    it('hydrates once per distinct identityId', async () => {
        const hydrate = vi.fn().mockResolvedValue(undefined)
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: [
                buildManagedAccount('src-a::a1', 'id-1'),
                buildManagedAccount('src-a::a2', 'id-1'),
                buildManagedAccount('src-a::a3', 'id-2'),
            ],
            fusionAccounts: [],
            managedAccountsByKey: new Map(),
            getIdentity: vi.fn(),
            hydrateMissingIdentitiesById: hydrate,
        })
        expect(hydrate).toHaveBeenCalledTimes(1)
        expect(hydrate).toHaveBeenCalledWith(['id-1', 'id-2'])
        expect(result.hydrated).toBe(2)
    })

    it('applies the identity layer to each FusionAccount with a correlated managed origin', async () => {
        const identity1 = makeIdentity('id-1')
        const acc1 = buildFusionAccountFromManaged('src-a::a1', 'id-1')
        const acc2 = buildFusionAccountFromManaged('src-a::a2', 'id-1')
        const acc3 = buildFusionAccountFromManaged('src-a::a3', 'id-2')
        const map = new Map<string, { identityId?: string }>([
            ['src-a::a1', { identityId: 'id-1' }],
            ['src-a::a2', { identityId: 'id-1' }],
            ['src-a::a3', { identityId: 'id-2' }],
        ])
        const getIdentity = (id: string) => {
            if (id === 'id-1') return identity1
            if (id === 'id-2') return makeIdentity('id-2')
            return undefined
        }
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: map.values(),
            fusionAccounts: [acc1, acc2, acc3],
            managedAccountsByKey: map,
            getIdentity,
            hydrateMissingIdentitiesById: vi.fn().mockResolvedValue(undefined),
        })
        expect(acc1.identityInfo?.id).toBe('id-1')
        expect(acc2.identityInfo?.id).toBe('id-1')
        expect(acc3.identityInfo?.id).toBe('id-2')
        expect(result.applied).toBe(3)
    })

    it('skips protected identities', async () => {
        const protectedIdentity = makeIdentity('id-1', { protected: true })
        const acc = buildFusionAccountFromManaged('src-a::a1', 'id-1')
        const map = new Map<string, { identityId?: string }>([['src-a::a1', { identityId: 'id-1' }]])
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: map.values(),
            fusionAccounts: [acc],
            managedAccountsByKey: map,
            getIdentity: () => protectedIdentity,
            hydrateMissingIdentitiesById: vi.fn().mockResolvedValue(undefined),
        })
        expect(acc.identityInfo).toBeUndefined()
        expect(result.applied).toBe(0)
    })

    it('skips fusionAccounts that already have identityInfo set', async () => {
        const acc1 = buildFusionAccountFromManaged('src-a::a1', 'id-1')
        acc1.addIdentityLayer(makeIdentity('id-1'))
        const acc2 = buildFusionAccountFromManaged('src-a::a2', 'id-1')
        const map = new Map<string, { identityId?: string }>([
            ['src-a::a1', { identityId: 'id-1' }],
            ['src-a::a2', { identityId: 'id-1' }],
        ])
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: map.values(),
            fusionAccounts: [acc1, acc2],
            managedAccountsByKey: map,
            getIdentity: () => makeIdentity('id-1'),
            hydrateMissingIdentitiesById: vi.fn().mockResolvedValue(undefined),
        })
        expect(result.applied).toBe(1)
    })

    it('skips fusionAccounts whose origin is not in the managedAccountsByKey map', async () => {
        const acc = FusionAccount.fromIdentity({ id: 'identity-origin', name: 'login' } as any)
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: [],
            fusionAccounts: [acc],
            managedAccountsByKey: new Map(),
            getIdentity: vi.fn(),
            hydrateMissingIdentitiesById: vi.fn().mockResolvedValue(undefined),
        })
        expect(result.applied).toBe(0)
    })
})

describe('hydrateCorrelatedManagedAccountIdentities end-to-end (chain-harness scenario)', () => {
    const minimalConfig = {
        sources: [
            { name: 'Source A', id: 'src-a', type: 'authoritative' },
            { name: 'Source B', id: 'src-b', type: 'record' },
        ],
        fusionAccountRefreshThresholdInSeconds: 3600,
        maxHistoryMessages: 50,
        reset: false,
    } as unknown as FusionConfig

    beforeAll(() => {
        FusionAccount.configure(minimalConfig)
    })

    it('hydrates a correlated identity, applies the layer, and exposes the alias on the FusionAccount', async () => {
        const run = new FusionRun()

        const identity: IdentityDocument = {
            id: 'id-1',
            name: 'aanderson',
            displayName: 'Alice Anderson',
            attributes: { displayName: 'Alice Anderson' },
        } as any
        run.addIdentity(identity.id, identity)

        const managedAccount = {
            id: 'src-b::acc-1',
            identityId: 'id-1',
            sourceId: 'src-b',
            nativeIdentity: 'acc-1',
            name: 'src-b-account-name',
        }
        run.managedAccountsById.set(managedAccount.id, managedAccount as any)

        const fusionAccount = FusionAccount.fromManagedAccount({
            id: managedAccount.id,
            sourceId: managedAccount.sourceId,
            nativeIdentity: managedAccount.nativeIdentity,
        } as any)
        run._fusionAccountMap.set(fusionAccount.managedKey, fusionAccount)

        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: run.managedAccountsById.values(),
            fusionAccounts: run.allFusionAccounts,
            managedAccountsByKey: run.managedAccountsById as Map<string, { identityId?: string }>,
            getIdentity: (id) => run.getIdentity(id),
            hydrateMissingIdentitiesById: vi.fn().mockResolvedValue(undefined),
        })

        expect(result.hydrated).toBe(1)
        expect(result.applied).toBe(1)
        expect(fusionAccount.identityInfo).toBeDefined()
        expect(fusionAccount.identityInfo?.id).toBe('id-1')
        // The authoritative alias is the SDK top-level displayName
        expect(fusionAccount.identityAlias).toBe('Alice Anderson')
        // It must NOT be the login
        expect(fusionAccount.identityAlias).not.toBe('aanderson')
        // It must NOT be the source account's name
        expect(fusionAccount.identityAlias).not.toBe('src-b-account-name')
    })

    it('handles many managed accounts across multiple chunks without dropping any', async () => {
        const run = new FusionRun()
        const N = 120 // > 2 batches of 50
        const accounts: { id: string; identityId: string }[] = []
        for (let i = 0; i < N; i++) {
            const identityId = `id-${i}`
            const identity: IdentityDocument = {
                id: identityId,
                name: `login-${i}`,
                displayName: `Display Name ${i}`,
            } as any
            run.addIdentity(identityId, identity)
            const acc = {
                id: `src-b::acc-${i}`,
                identityId,
                sourceId: 'src-b',
                nativeIdentity: `acc-${i}`,
                name: `source-name-${i}`,
            }
            run.managedAccountsById.set(acc.id, acc as any)
            accounts.push(acc)
        }

        const collectedChunks: string[][] = []
        const result = await hydrateCorrelatedManagedAccountIdentities({
            managedAccounts: run.managedAccountsById.values(),
            fusionAccounts: run.allFusionAccounts,
            managedAccountsByKey: run.managedAccountsById as Map<string, { identityId?: string }>,
            getIdentity: (id) => run.getIdentity(id),
            hydrateMissingIdentitiesById: vi.fn().mockImplementation(async (ids: string[]) => {
                collectedChunks.push(ids)
            }),
        })

        // Helper passed all distinct ids in a single batch (chunking is the responsibility of the consumer's hydrateMissingIdentitiesById).
        expect(result.hydrated).toBe(N)
        // The internal collect produced one chunk per call to the helper.
        expect(collectedChunks.length).toBe(1)
        expect(collectedChunks[0].length).toBe(N)
    })
})
