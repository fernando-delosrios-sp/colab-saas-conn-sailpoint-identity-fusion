import { FormService } from '../formService'
import { FusionRun } from '../../../model/fusionRun'
import { FusionAccount } from '../../../model/account'

/** Minimal client.call mock that supports sequential pagination used by form instance fetch. */
function createFormClientCallMock(customFormsMock: Record<string, unknown>) {
    return async (fn: (api: { customForms: typeof customFormsMock }, params?: unknown) => Promise<unknown>, policy?: {
        paginate?: { mode: string; baseParams?: Record<string, unknown> }
        onPageProgress?: (loaded: number, total?: number) => void
    }) => {
        const api = { customForms: customFormsMock }
        if (policy?.paginate?.mode === 'sequential') {
            const params = { ...(policy.paginate.baseParams ?? {}), limit: 250, offset: 0 }
            const page = (await fn(api, params)) as { data?: unknown[] }
            const items = page?.data ?? []
            policy.onPageProgress?.(items.length)
            return items
        }
        const result = await fn(api)
        if (result && typeof result === 'object' && 'data' in result) {
            const data = (result as { data: unknown }).data
            if (Array.isArray(data)) return data
            if (data && typeof data === 'object' && 'results' in data) {
                return (data as { results: unknown[] }).results
            }
        }
        return result
    }
}

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
                call: createFormClientCallMock(customFormsMock),
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
                call: createFormClientCallMock(customFormsMock),
            } as any,
            {} as any
        )

        await service.fetchFormInstancesByDefinitionId('fd-1')

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('returned 250 instance(s) for formDefinitionId=fd-1'))
    })

    it('reports instance fetch progress via onInstancesLoaded callback', async () => {
        const customFormsMock = {
            searchFormInstancesByTenant: vi.fn().mockResolvedValue({
                data: [
                    { id: '1', formDefinitionId: 'fd-1' },
                    { id: '2', formDefinitionId: 'fd-1' },
                ],
            }),
        }

        const service = new FormService(
            {} as any,
            { warn: vi.fn(), debug: vi.fn() } as any,
            {
                customFormsApi: customFormsMock,
                call: createFormClientCallMock(customFormsMock),
            } as any,
            {} as any
        )

        const deltas: number[] = []
        await service.fetchFormInstancesByDefinitionId('fd-1', (delta) => deltas.push(delta))

        expect(deltas).toEqual([2])
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

        const setProgress = vi.fn()
        const service = new FormService(
            {
                fusionFormNamePattern: 'Fusion',
                fusionFormExpirationDays: 7,
            } as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), setProgress } as any,
            {
                customFormsApi: customFormsMock,
                call: createFormClientCallMock(customFormsMock),
                execute: async (fn: () => Promise<any>) => fn(),
            } as any,
            {} as any
        )

        await service.fetchFormInstances(true)
        await service.cleanUpForms()
        await service.awaitPendingDeleteOperations()

        expect(searchFormInstancesByTenant).toHaveBeenCalledTimes(1)
        expect(searchFormInstancesByTenant).toHaveBeenCalledWith(
            expect.objectContaining({ filters: 'formDefinitionId eq "form-fresh"' })
        )
        expect(setProgress).not.toHaveBeenCalled()
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
                call: createFormClientCallMock(customFormsMock),
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
        const managedAccountInventory = new Map([[managedKey, {
            id: managedAccount.id,
            name: managedAccount.name,
            sourceName: managedAccount.sourceName,
            sourceId: managedAccount.sourceId,
            nativeIdentity: managedAccount.nativeIdentity,
        }]])
        const managedAccountsByIdentityId = new Map([[identityId, new Set([managedKey])]])

        const run = {
            managedAccountsById,
            managedAccountInventory,
            managedAccountsByIdentityId,
            hasManagedAccount: (key: string) => managedAccountInventory.has(key),
            getManagedAccountInfo: (key: string) => managedAccountInventory.get(key),
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

    it('claims pending review account using normalized form account id', () => {
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
        const managedAccountInventory = new Map([
            [
                managedKey,
                {
                    id: managedAccount.id,
                    name: managedAccount.name,
                    sourceName: managedAccount.sourceName,
                    sourceId: managedAccount.sourceId,
                    nativeIdentity: managedAccount.nativeIdentity,
                    identityId,
                },
            ],
        ])
        const managedAccountsByIdentityId = new Map([[identityId, new Set([managedKey])]])
        const claimAccount = vi.fn((key: string, claimIdentityId?: string) => {
            managedAccountsById.delete(key)
            if (claimIdentityId) {
                const idSet = managedAccountsByIdentityId.get(claimIdentityId)
                idSet?.delete(key)
                if (idSet && idSet.size === 0) {
                    managedAccountsByIdentityId.delete(claimIdentityId)
                }
            }
            return true
        })

        const run = {
            managedAccountsById,
            managedAccountInventory,
            managedAccountsByIdentityId,
            hasManagedAccount: (key: string) => managedAccountInventory.has(key),
            getManagedAccountInfo: (key: string) => managedAccountInventory.get(key),
            claimAccount,
        } as any

        const service = new FormService(
            {} as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as any,
            {} as any,
            { run, getSourceByNameSafe: vi.fn(() => undefined) } as any,
            undefined,
            undefined,
            run
        )

        const accountInfo = (service as any).extractAccountInfoOverride(' source-a-id::native-sync-1 ', true)

        expect(accountInfo?.id).toBe(managedKey)
        expect(claimAccount).toHaveBeenCalledWith(managedKey, identityId)
        expect(managedAccountsById.has(managedKey)).toBe(false)
    })

    it('returns inventory metadata after prior pending-review claim in the same batch', () => {
        const managedKey = 'source-a-id::native-sync-1'
        const identityId = 'identity-sync-1'
        const inventoryInfo = {
            id: 'acct-sync-1',
            name: 'Sync User',
            sourceName: 'Source A',
            sourceId: 'source-a-id',
            nativeIdentity: 'native-sync-1',
            identityId,
        }
        const managedAccountsById = new Map<string, any>()
        const managedAccountInventory = new Map([[managedKey, inventoryInfo]])
        const run = {
            managedAccountsById,
            managedAccountInventory,
            managedAccountsByIdentityId: new Map(),
            hasManagedAccount: (key: string) => managedAccountInventory.has(key),
            getManagedAccountInfo: (key: string) => managedAccountInventory.get(key),
            claimAccount: vi.fn(),
        } as any

        const service = new FormService(
            {} as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as any,
            {} as any,
            { run, getSourceByNameSafe: vi.fn(() => undefined) } as any,
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
        expect(run.claimAccount).not.toHaveBeenCalled()
    })
})

describe('FormService processFetchedFormData pending review queue depletion', () => {
    it('removes pending-review account from work queue while retaining inventory', async () => {
        const managedKey = 'source-a-id::native-sync-1'
        const run = new FusionRun()
        run.setManagedAccount(managedKey, {
            id: 'acct-sync-1',
            sourceId: 'source-a-id',
            sourceName: 'Source A',
            nativeIdentity: 'native-sync-1',
            identityId: 'identity-sync-1',
            name: 'Sync User',
        } as any)

        const service = new FormService(
            {} as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as any,
            {} as any,
            { run, getSourceByNameSafe: vi.fn(() => undefined) } as any,
            undefined,
            undefined,
            run
        )

        ;(service as any)._fetchedFormInstances = [
            [
                {
                    id: 'instance-1',
                    state: 'PENDING',
                    formDefinitionId: 'form-def-1',
                    formInput: {
                        account: managedKey,
                        name: 'Sync User',
                        source: 'Source A',
                    },
                },
            ],
        ]

        await service.processFetchedFormData()

        expect(run.managedAccountsById.has(managedKey)).toBe(false)
        expect(run.hasManagedAccount(managedKey)).toBe(true)
        expect(run.getManagedAccountInfo(managedKey)?.identityId).toBe('identity-sync-1')
    })
})

describe('FormService getOrCreateFormDefinition conflict recovery', () => {
    it('reuses existing definition after duplicate-name create conflict', async () => {
        FusionAccount.configure({ sources: [] } as any)
        const existingDefinition = { id: 'form-existing', name: 'Fusion Test Form' }
        const getFormDefinitionByName = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(existingDefinition)
        const buildFusionFormDefinition = vi.fn().mockRejectedValue({
            response: { status: 409, data: { detailCode: '400.1.409' } },
        })

        const service = new FormService(
            {} as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as any,
            {} as any,
            {} as any
        )
        ;(service as any).getFormDefinitionByName = getFormDefinitionByName
        ;(service as any).buildFusionFormDefinition = buildFusionFormDefinition

        const result = await (service as any).getOrCreateFormDefinition(
            'Fusion Test Form',
            FusionAccount.fromManagedAccount({
                id: 'acct-1',
                nativeIdentity: 'native-1',
                name: 'Managed Account',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any),
            []
        )

        expect(result).toEqual(existingDefinition)
        expect(getFormDefinitionByName).toHaveBeenCalledTimes(2)
        expect(buildFusionFormDefinition).toHaveBeenCalledTimes(1)
    })
})


