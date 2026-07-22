import { FormService } from '../formService'

describe('FormService fetchFormInstancesByDefinitionId', () => {
    it('filters out instances with mismatched formDefinitionId', async () => {
        const warn = vi.fn()
        const debug = vi.fn()
        const fakeInstances = [
            { id: '1', formDefinitionId: 'fd-1' },
            { id: '2', formDefinitionId: 'fd-2' },
            { id: '3', formDefinitionId: 'fd-1' },
        ]

        const customFormsMock = {
            searchFormInstancesByTenant: vi.fn().mockResolvedValue({ data: fakeInstances }),
        }

        const service = new FormService(
            {} as any,
            { warn, debug } as any,
            {
                customFormsApi: customFormsMock,
                call: async (fn: (api: any) => Promise<any>) => fn({ customForms: customFormsMock }),
            } as any,
            {} as any
        )

        const result = await service.fetchFormInstancesByDefinitionId('fd-1')

        expect(result).toHaveLength(2)
        expect(result.map((x) => x.id)).toEqual(['1', '3'])
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('returned 1 instance(s) outside requested formDefinitionId=fd-1')
        )
    })

    it('warns when API returns page-size ceiling of 250', async () => {
        const warn = vi.fn()
        const instances = Array.from({ length: 250 }, (_, i) => ({
            id: `i-${i}`,
            formDefinitionId: 'fd-1',
        }))

        const customFormsMock = {
            searchFormInstancesByTenant: vi.fn().mockResolvedValue({ data: instances }),
        }

        const service = new FormService(
            {} as any,
            { warn, debug: vi.fn() } as any,
            {
                customFormsApi: customFormsMock,
                call: async (fn: (api: any) => Promise<any>) => fn({ customForms: customFormsMock }),
            } as any,
            {} as any
        )

        await service.fetchFormInstancesByDefinitionId('fd-1')

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('returned 250 instance(s) for formDefinitionId=fd-1'))
    })
})

describe('FormService stale-form cleanup queue', () => {
    it('queues stale forms for deletion and skips instance fetch for those definitions', async () => {
        const now = Date.now()
        const staleDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()
        const freshDate = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
        const searchFormDefinitionsByTenant = vi.fn().mockResolvedValue({
            data: {
                results: [
                    { id: 'form-stale', name: 'Fusion stale', created: staleDate },
                    { id: 'form-fresh', name: 'Fusion fresh', created: freshDate },
                ],
            },
        })

        const searchFormInstancesByTenant = vi.fn().mockResolvedValue({ data: [] })
        const deleteFormDefinition = vi.fn().mockResolvedValue({})

        const customFormsMock = {
            searchFormInstancesByTenant,
            searchFormDefinitionsByTenant,
            deleteFormDefinition,
        }

        const service = new FormService(
            {
                fusionFormNamePattern: 'Fusion',
                fusionFormExpirationDays: 7,
            } as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as any,
            {
                customFormsApi: customFormsMock,
                call: async (fn: (api: any, ...args: any[]) => Promise<any>) => {
                    const result = await fn({ customForms: customFormsMock })
                    if (result && typeof result === 'object' && 'data' in result && Array.isArray(result.data)) {
                        return result.data
                    }
                    return result
                },
                execute: async (fn: () => Promise<any>) => fn(),
            } as any,
            {} as any
        )

        await service.fetchFormInstances(true)
        await service.cleanUpForms()
        await service.awaitPendingDeleteOperations()

        expect(searchFormInstancesByTenant).toHaveBeenCalledTimes(1)
        expect(searchFormInstancesByTenant).toHaveBeenCalledWith({
            filters: 'formDefinitionId eq "form-fresh"',
        })
        expect(deleteFormDefinition).toHaveBeenCalledTimes(1)
        expect(deleteFormDefinition).toHaveBeenCalledWith({ formDefinitionID: 'form-stale' })
    })

    it('does not block while queued deletions are still running', async () => {
        let resolveDelete: (() => void) | undefined
        const deleteFormDefinition = vi.fn().mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveDelete = resolve
                })
        )

        const customFormsMock = {
            deleteFormDefinition,
            searchFormInstancesByTenant: vi.fn().mockResolvedValue({ data: [] }),
        }

        const service = new FormService(
            {
                fusionFormNamePattern: 'Fusion',
                fusionFormExpirationDays: 7,
            } as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as any,
            {
                customFormsApi: customFormsMock,
                call: async (fn: (api: any) => Promise<any>) => fn({ customForms: customFormsMock }),
            } as any,
            {} as any
        )

        ;(service as any).addFormToDelete('form-stale')

        await service.cleanUpForms()
        expect(deleteFormDefinition).toHaveBeenCalledTimes(1)

        let drained = false
        const drainPromise = service.awaitPendingDeleteOperations().then(() => {
            drained = true
        })
        await Promise.resolve()
        expect(drained).toBe(false)

        resolveDelete?.()
        await drainPromise
        expect(drained).toBe(true)
    })
})

describe('FormService managed work queue synchronization', () => {
    it('removes account from managedAccountsByIdentityId when account is removed from managedAccountsById', () => {
        const managedKey = 'source-a-id::native-sync-1'
        const identityId = 'identity-sync-1'
        const managedAccount = {
            id: 'acct-sync-1',
            sourceId: 'source-a-id',
            sourceName: 'Source A',
            nativeIdentity: 'native-sync-1',
            identityId,
            name: 'Sync User',
        } as any

        const managedAccountsById = new Map([[managedKey, managedAccount]])
        const managedAccountsAllById = new Map([[managedKey, managedAccount]])
        const managedAccountsByIdentityId = new Map([[identityId, new Set([managedKey])]])

        const run = {
            managedAccountsById,
            managedAccountsAllById,
            managedAccountsByIdentityId,
            claimAccount: vi.fn((key: string, identityId?: string) => {
                const deleted = managedAccountsById.delete(key)
                if (identityId) {
                    const idSet = managedAccountsByIdentityId.get(identityId)
                    if (idSet) {
                        idSet.delete(key)
                        if (idSet.size === 0) {
                            managedAccountsByIdentityId.delete(identityId)
                        }
                    }
                }
                return deleted
            }),
        } as any

        const sources = {
            run,
            getSourceByNameSafe: vi.fn(() => undefined),
        } as any

        const service = new FormService(
            {} as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as any,
            {} as any,
            sources,
            undefined,
            undefined,
            run
        )

        const accountInfo = (service as any).extractAccountInfoOverride(managedKey, true)

        expect(accountInfo).toEqual({
            id: managedKey,
            name: 'Sync User',
            sourceName: 'Source A',
            sourceId: 'source-a-id',
            nativeIdentity: 'native-sync-1',
        })
        expect(managedAccountsById.has(managedKey)).toBe(false)
        expect(managedAccountsByIdentityId.has(identityId)).toBe(false)
    })
})
