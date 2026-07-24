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
                {
                    id: 'acct-existing',
                    source: { id: 'source-a-id', name: 'Source A' },
                    accountId: 'user-from-identity',
                },
                { id: 'acct-other', source: { name: 'Source B' } },
                { id: 'acct-unknown', source: { name: 'Unknown Source' } },
                { id: 'acct-nosource' },
                {
                    id: 'acct-existing',
                    source: { id: 'source-a-id', name: 'Source A' },
                    accountId: 'user-from-identity',
                },
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
                                accounts: ['source-a-id::user-stored'],
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
            log: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
        } as any

        await rebuildFusionAccount('fusion-1', {} as any, registry)

        expect(fetchManagedAccount).toHaveBeenCalledTimes(2)
        expect(fetchManagedAccount).toHaveBeenCalledWith('source-a-id', 'user-stored')
        expect(fetchManagedAccount).toHaveBeenCalledWith('source-a-id', 'user-from-identity')
        expect(fetchManagedAccount).not.toHaveBeenCalledWith(expect.anything(), 'acct-other')
    })

    it('calls fetchManagedAccount once per composite key (no separate fetchSourceAccountByNativeIdentity)', async () => {
        const fetchManagedAccount = jest.fn().mockResolvedValue(undefined)

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
                getSourceByName: jest.fn(() => ({ isManaged: true })),
            },
            identities: {
                fetchIdentityById: jest.fn().mockResolvedValue(undefined),
                getIdentityById: jest.fn().mockReturnValue({ id: 'identity-2', accounts: [] }),
            },
            fusion: {
                processFusionAccount: jest.fn().mockResolvedValue({ nativeIdentity: 'fusion-2' }),
            },
            log: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
        } as any

        await rebuildFusionAccount('fusion-2', {} as any, registry)

        expect(fetchManagedAccount).toHaveBeenCalledTimes(1)
        expect(fetchManagedAccount).toHaveBeenCalledWith('source-a', 'native-99')
    })

    it('warns and skips legacy non-composite account references', async () => {
        const fetchManagedAccount = jest.fn().mockResolvedValue(undefined)
        const log = { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() }

        const registry = {
            sources: {
                fetchFusionAccount: jest.fn().mockResolvedValue(undefined),
                fusionAccountsByNativeIdentity: new Map([
                    [
                        'fusion-3',
                        {
                            nativeIdentity: 'fusion-3',
                            identityId: 'identity-3',
                            attributes: {
                                accounts: ['legacy-platform-uuid-only'],
                            },
                        },
                    ],
                ]),
                fetchManagedAccount,
                getSourceByName: jest.fn(),
            },
            identities: {
                fetchIdentityById: jest.fn().mockResolvedValue(undefined),
                getIdentityById: jest.fn().mockReturnValue({ id: 'identity-3', accounts: [] }),
            },
            fusion: {
                processFusionAccount: jest.fn().mockResolvedValue({ nativeIdentity: 'fusion-3' }),
            },
            log,
        } as any

        await rebuildFusionAccount('fusion-3', {} as any, registry)

        expect(log.warn).toHaveBeenCalledWith(
            expect.stringContaining('Skipping legacy non-composite managed account reference')
        )
        expect(fetchManagedAccount).not.toHaveBeenCalled()
    })

    it('checks identity scope for identity-origin accounts and passes result to processFusionAccount', async () => {
        const processFusionAccount = jest.fn().mockResolvedValue({ nativeIdentity: 'fusion-scope-1' })
        const isIdentityInScope = jest.fn().mockResolvedValue(false)

        const registry = {
            sources: {
                fetchFusionAccount: jest.fn().mockResolvedValue(undefined),
                fusionAccountsByNativeIdentity: new Map([
                    [
                        'fusion-scope-1',
                        {
                            nativeIdentity: 'fusion-scope-1',
                            identityId: 'identity-1',
                            attributes: {
                                originSource: 'Identities',
                                originAccount: 'identity-1',
                                accounts: [],
                            },
                        },
                    ],
                ]),
                fetchManagedAccount: jest.fn().mockResolvedValue(undefined),
                getSourceByName: jest.fn(),
            },
            identities: {
                fetchIdentityById: jest.fn().mockResolvedValue(undefined),
                getIdentityById: jest.fn().mockReturnValue({ id: 'identity-1', accounts: [] }),
                isIdentityInScope,
            },
            fusion: {
                processFusionAccount,
            },
            log: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
        } as any

        await rebuildFusionAccount('fusion-scope-1', {} as any, registry)

        expect(isIdentityInScope).toHaveBeenCalledWith('identity-1')
        expect(processFusionAccount).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            false
        )
    })

    it('does not check identity scope for managed-origin accounts', async () => {
        const processFusionAccount = jest.fn().mockResolvedValue({ nativeIdentity: 'fusion-managed-origin-1' })
        const isIdentityInScope = jest.fn().mockResolvedValue(false)

        const registry = {
            sources: {
                fetchFusionAccount: jest.fn().mockResolvedValue(undefined),
                fusionAccountsByNativeIdentity: new Map([
                    [
                        'fusion-managed-origin-1',
                        {
                            nativeIdentity: 'fusion-managed-origin-1',
                            identityId: 'identity-1',
                            attributes: {
                                originSource: 'Source A',
                                originAccount: 'source-a-id::native-1',
                                accounts: [],
                            },
                        },
                    ],
                ]),
                fetchManagedAccount: jest.fn().mockResolvedValue(undefined),
                getSourceByName: jest.fn(),
            },
            identities: {
                fetchIdentityById: jest.fn().mockResolvedValue(undefined),
                getIdentityById: jest.fn().mockReturnValue({ id: 'identity-1', accounts: [] }),
                isIdentityInScope,
            },
            fusion: {
                processFusionAccount,
            },
            log: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
        } as any

        await rebuildFusionAccount('fusion-managed-origin-1', {} as any, registry)

        expect(isIdentityInScope).not.toHaveBeenCalled()
        expect(processFusionAccount).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            undefined
        )
    })
})
