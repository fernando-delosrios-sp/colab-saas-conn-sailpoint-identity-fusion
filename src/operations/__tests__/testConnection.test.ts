import { testConnection } from '../testConnection'
import { createOperationTestRegistry, SourceConfigLike } from './harness/operationTestRegistry'

function createMockRegistry(sourceConfigs: SourceConfigLike[]) {
    const registry = createOperationTestRegistry({ sourceConfigs: sourceConfigs as any })
    const sources = registry.sources as any
    const schemas = registry.schemas as any
    const timer = { phase: vi.fn(), end: vi.fn(), totalElapsed: vi.fn(() => 0), getPhaseBreakdown: vi.fn(() => ({})) }
    return { registry, sources, schemas, timer }
}

describe('testConnection', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('enforces reverse correlation setup for reverse sources', async () => {
        const reverseSource = {
            name: 'Microsoft Entra',
            correlationMode: 'reverse' as const,
            correlationAttribute: 'entra-id',
            correlationDisplayName: 'Entra ID',
        }
        const { registry, sources, schemas } = createMockRegistry([reverseSource])

        await testConnection(registry, {})

        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(sources.validateAccountJmespathFilters).toHaveBeenCalledTimes(1)
        expect(schemas.getManagedSourceSchemaAttributeNames).toHaveBeenCalledTimes(1)
        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledTimes(1)
        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledWith(reverseSource, expect.any(Set))
    })

    it('skips reverse correlation setup when no reverse sources are configured', async () => {
        const { registry, sources, schemas } = createMockRegistry([{ name: 'AD', correlationMode: 'none' }])

        await testConnection(registry, {})

        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(sources.validateAccountJmespathFilters).toHaveBeenCalledTimes(1)
        expect(schemas.getManagedSourceSchemaAttributeNames).not.toHaveBeenCalled()
        expect(sources.ensureReverseCorrelationSetup).not.toHaveBeenCalled()
    })

    it('ensures delayed aggregation workflow when delayed sources are configured', async () => {
        const { registry, sources } = createMockRegistry([
            { name: 'HR', correlationMode: 'none', aggregationMode: 'delayed' },
        ])

        await testConnection(registry, {})

        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(registry.workflows.fetchDelayedAggregationSender).toHaveBeenCalledTimes(1)
    })

    it('skips delayed aggregation workflow validation when no delayed sources are configured', async () => {
        const { registry } = createMockRegistry([{ name: 'AD', correlationMode: 'none', aggregationMode: 'before' }])

        await testConnection(registry, {})

        expect(registry.workflows.fetchDelayedAggregationSender).not.toHaveBeenCalled()
    })

    it('fails test connection when Accounts JMESPath filter validation fails', async () => {
        const { registry, sources } = createMockRegistry([{ name: 'AD', correlationMode: 'none' }])
        sources.validateAccountJmespathFilters.mockImplementation(() => {
            throw new Error('Invalid expression')
        })

        await testConnection(registry, {})
        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(sources.validateAccountJmespathFilters).toHaveBeenCalledTimes(1)
        expect(registry.log.crash).toHaveBeenCalledTimes(1)
        expect(registry.log.crash).toHaveBeenCalledWith('Failed to test connection', expect.any(Error))
    })

    it('ensures email sender workflow validation', async () => {
        const { registry } = createMockRegistry([{ name: 'AD', correlationMode: 'none' }])

        await testConnection(registry, {})

        expect(registry.workflows.fetchSender).toHaveBeenCalledTimes(1)
    })
})
