import { SourceService } from '../sourceService'
import { SourceInfo } from '../types'

const createService = (sourceConfigOverrides: Record<string, unknown> = {}) => {
    const config: any = {
        sources: [
            {
                name: 'HR Source',
                sourceType: 'authoritative',
                ...sourceConfigOverrides,
            },
        ],
        spConnectorInstanceId: 'fusion-id',
        concurrencyCheckEnabled: true,
        batchCumulativeCount: {},
        attributeMaps: [],
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [],
    }
    const log: any = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }
    const client: any = {
        execute: async (fn: () => Promise<any>) => fn(),
        paginate: jest.fn(),
        paginateParallel: jest.fn(),
        accountsApi: {
            listAccounts: jest.fn(),
        },
        sourcesApi: {
            importAccounts: jest.fn(),
        },
        taskManagementApi: {
            getTaskStatus: jest.fn(),
        },
    }

    const service = new SourceService(config, log, client)
    const sourceInfo: SourceInfo = {
        id: 'managed-source-id',
        name: 'HR Source',
        isManaged: true,
        sourceType: 'authoritative',
        config: config.sources[0],
    }
    ;(service as any)._allSources = [sourceInfo]
    ;(service as any).sourcesById = new Map([[sourceInfo.id, sourceInfo]])
    ;(service as any).sourcesByName = new Map([[sourceInfo.name, sourceInfo]])

    return { service, client, sourceInfo }
}

describe('SourceService Accounts JMESPath filter', () => {
    it('filters managed accounts page-wise during fetchManagedAccounts', async () => {
        const { service, sourceInfo } = createService({
            accountJmespathFilter: 'accounts[?attributes.department == `Engineering`]',
        })

        jest.spyOn(service, 'fetchAccountsBySourceIdGenerator').mockImplementation(async function* () {
            yield [
                { id: 'a1', identityId: 'i1', attributes: { department: 'Engineering' } } as any,
                { id: 'a2', identityId: 'i2', attributes: { department: 'Finance' } } as any,
            ]
        })

        ;(service as any)._allSources = [sourceInfo]
        await service.fetchManagedAccounts()

        expect(service.managedAccountsById.size).toBe(1)
        expect(service.managedAccountsById.has('a1')).toBe(true)
        expect(service.managedAccountsById.has('a2')).toBe(false)
    })

    it('rejects invalid JMESPath expressions in validation', () => {
        const { service } = createService({
            accountJmespathFilter: 'accounts[?',
        })

        expect(() => service.validateAccountJmespathFilters()).toThrow(
            'Invalid Accounts JMESPath filter for source "HR Source"'
        )
    })
})

describe('SourceService per-source aggregation polling', () => {
    it('uses per-source retries and wait for before aggregation polling', async () => {
        const { service, client } = createService({
            aggregationMode: 'before',
            taskResultRetries: 2,
            taskResultWait: 0,
        })

        client.sourcesApi.importAccounts.mockResolvedValue({
            data: { task: { id: 'task-1' } },
        })
        client.taskManagementApi.getTaskStatus.mockResolvedValue({
            data: { completed: false, completionStatus: 'IN_PROGRESS' },
        })

        await (service as any).aggregateManagedSource('managed-source-id', false, true)

        expect(client.taskManagementApi.getTaskStatus).toHaveBeenCalledTimes(1)
        expect((service as any).log.warn).toHaveBeenCalledWith(expect.stringContaining('pollWaitMs=0'))
        expect((service as any).log.warn).toHaveBeenCalledWith(expect.stringContaining('maxPolls=1'))
    })
})

describe('SourceService fetchManagedAccount source scoping', () => {
    it('ignores account IDs that resolve to non-configured managed sources', async () => {
        const { service } = createService()
        jest.spyOn(service as any, 'fetchAccountById').mockResolvedValue({
            id: 'acct-1',
            sourceName: 'Some Other Source',
        } as any)

        await service.fetchManagedAccount('acct-1')

        expect(service.managedAccountsById.size).toBe(0)
        expect(service.managedAccountsAllById.size).toBe(0)
    })
})
