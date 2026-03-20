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
        taskResultRetries: 3,
        taskResultWait: 1000,
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
