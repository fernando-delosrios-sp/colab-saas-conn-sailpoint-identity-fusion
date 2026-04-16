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
