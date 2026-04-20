import { FormService } from '../formService'

describe('FormService fetchFormInstancesByDefinitionId', () => {
    it('filters out instances with mismatched formDefinitionId', async () => {
        const warn = jest.fn()
        const debug = jest.fn()
        const fakeInstances = [
            { id: '1', formDefinitionId: 'fd-1' },
            { id: '2', formDefinitionId: 'fd-2' },
            { id: '3', formDefinitionId: 'fd-1' },
        ]

        const service = new FormService(
            {} as any,
            { warn, debug } as any,
            {
                customFormsApi: {
                    searchFormInstancesByTenant: jest.fn().mockResolvedValue({ data: fakeInstances }),
                },
                execute: async (fn: () => Promise<any>) => fn(),
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
        const warn = jest.fn()
        const instances = Array.from({ length: 250 }, (_, i) => ({
            id: `i-${i}`,
            formDefinitionId: 'fd-1',
        }))

        const service = new FormService(
            {} as any,
            { warn, debug: jest.fn() } as any,
            {
                customFormsApi: {
                    searchFormInstancesByTenant: jest.fn().mockResolvedValue({ data: instances }),
                },
                execute: async (fn: () => Promise<any>) => fn(),
            } as any,
            {} as any
        )

        await service.fetchFormInstancesByDefinitionId('fd-1')

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('returned 250 instance(s) for formDefinitionId=fd-1')
        )
    })
})

describe('FormService stale-form cleanup queue', () => {
    it('queues stale forms for deletion and skips instance fetch for those definitions', async () => {
        const now = Date.now()
        const staleDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()
        const freshDate = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
        const searchFormInstancesByTenant = jest.fn().mockResolvedValue({ data: [] })
        const deleteFormDefinition = jest.fn().mockResolvedValue(undefined)

        const service = new FormService(
            {
                fusionFormNamePattern: 'Fusion',
                fusionFormExpirationDays: 7,
            } as any,
            { warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as any,
            {
                customFormsApi: {
                    searchFormInstancesByTenant,
                    deleteFormDefinition,
                },
                execute: async (fn: () => Promise<any>) => fn(),
                paginate: jest.fn().mockResolvedValue([
                    { id: 'form-stale', name: 'Fusion stale', created: staleDate },
                    { id: 'form-fresh', name: 'Fusion fresh', created: freshDate },
                ]),
            } as any,
            {} as any
        )

        await service.fetchFormInstancesData(true)
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
        const deleteFormDefinition = jest.fn().mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveDelete = resolve
                })
        )

        const service = new FormService(
            {
                fusionFormNamePattern: 'Fusion',
                fusionFormExpirationDays: 7,
            } as any,
            { warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as any,
            {
                customFormsApi: {
                    deleteFormDefinition,
                    searchFormInstancesByTenant: jest.fn().mockResolvedValue({ data: [] }),
                },
                execute: async (fn: () => Promise<any>) => fn(),
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
