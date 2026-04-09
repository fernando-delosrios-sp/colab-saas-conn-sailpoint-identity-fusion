import { rebuildFusionAccount } from '../rebuildFusionAccount'

describe('rebuildFusionAccount', () => {
    it('fetches managed accounts from fusion attributes and identity links for configured managed sources only', async () => {
        const fetchManagedAccount = jest.fn().mockResolvedValue(undefined)
        const processFusionAccount = jest.fn().mockResolvedValue({ nativeIdentity: 'fusion-1' })
        const getSourceByName = jest.fn((sourceName: string) => {
            if (sourceName === 'Source A') return { isManaged: true }
            if (sourceName === 'Source B') return { isManaged: false }
            return undefined
        })
        const getIdentityById = jest.fn().mockReturnValue({
            id: 'identity-1',
            accounts: [
                { id: 'acct-existing', source: { name: 'Source A' } },
                { id: 'acct-new', source: { name: 'Source A' } },
                { id: 'acct-other', source: { name: 'Source B' } },
                { id: 'acct-unknown', source: { name: 'Unknown Source' } },
                { id: 'acct-nosource' },
                { id: 'acct-existing', source: { name: 'Source A' } },
            ],
        })

        const registry = {
            sources: {
                fetchFusionAccount: jest.fn().mockResolvedValue(undefined),
                fusionAccountsByNativeIdentity: new Map([
                    [
                        'fusion-1',
                        {
                            nativeIdentity: 'fusion-1',
                            identityId: 'identity-1',
                            attributes: {
                                accounts: ['acct-existing'],
                            },
                        },
                    ],
                ]),
                fetchManagedAccount,
                getSourceByName,
            },
            identities: {
                fetchIdentityById: jest.fn().mockResolvedValue(undefined),
                getIdentityById,
            },
            fusion: {
                processFusionAccount,
            },
        } as any

        await rebuildFusionAccount('fusion-1', {} as any, registry)

        expect(fetchManagedAccount).toHaveBeenCalledTimes(2)
        expect(fetchManagedAccount).toHaveBeenCalledWith('acct-existing')
        expect(fetchManagedAccount).toHaveBeenCalledWith('acct-new')
        expect(fetchManagedAccount).not.toHaveBeenCalledWith('acct-other')
        expect(fetchManagedAccount).not.toHaveBeenCalledWith('acct-unknown')
        expect(fetchManagedAccount).not.toHaveBeenCalledWith('acct-nosource')
    })

    it('resolves composite managed account keys through sourceId/nativeIdentity lookup', async () => {
        const fetchManagedAccount = jest.fn().mockResolvedValue(undefined)
        const fetchSourceAccountByNativeIdentity = jest.fn().mockResolvedValue({
            id: 'acct-rotated',
            sourceName: 'Source A',
        })

        const registry = {
            sources: {
                fetchFusionAccount: jest.fn().mockResolvedValue(undefined),
                fusionAccountsByNativeIdentity: new Map([
                    [
                        'fusion-2',
                        {
                            nativeIdentity: 'fusion-2',
                            identityId: 'identity-2',
                            attributes: {
                                accounts: ['source-a::native-99'],
                            },
                        },
                    ],
                ]),
                fetchManagedAccount,
                fetchSourceAccountByNativeIdentity,
                getSourceByName: jest.fn(() => ({ isManaged: true })),
            },
            identities: {
                fetchIdentityById: jest.fn().mockResolvedValue(undefined),
                getIdentityById: jest.fn().mockReturnValue({ id: 'identity-2', accounts: [] }),
            },
            fusion: {
                processFusionAccount: jest.fn().mockResolvedValue({ nativeIdentity: 'fusion-2' }),
            },
        } as any

        await rebuildFusionAccount('fusion-2', {} as any, registry)

        expect(fetchSourceAccountByNativeIdentity).toHaveBeenCalledWith('source-a', 'native-99')
        expect(fetchManagedAccount).toHaveBeenCalledWith('acct-rotated')
    })
})
