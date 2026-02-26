import { testConnection } from '../testConnection'
import { ServiceRegistry } from '../../services/serviceRegistry'

type SourceConfigLike = {
    name: string
    correlationMode: 'none' | 'correlate' | 'reverse'
    correlationAttribute?: string
    correlationDisplayName?: string
}

function createMockRegistry(sourceConfigs: SourceConfigLike[]) {
    const timer = {
        phase: jest.fn(),
        end: jest.fn(),
    }

    const sources = {
        fetchAllSources: jest.fn().mockResolvedValue(undefined),
        ensureReverseCorrelationSetup: jest.fn().mockResolvedValue(undefined),
    }

    const schemas = {
        getManagedSourceSchemaAttributeNames: jest.fn().mockResolvedValue(new Set<string>()),
    }

    const registry = {
        config: { sources: sourceConfigs },
        log: {
            info: jest.fn(),
            crash: jest.fn(),
            timer: jest.fn(() => timer),
        },
        res: { send: jest.fn() },
        sources,
        schemas,
    } as any

    return { registry, sources, schemas, timer }
}

describe('testConnection', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
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
        expect(schemas.getManagedSourceSchemaAttributeNames).toHaveBeenCalledTimes(1)
        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledTimes(1)
        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledWith(reverseSource, expect.any(Set))
    })

    it('skips reverse correlation setup when no reverse sources are configured', async () => {
        const { registry, sources, schemas } = createMockRegistry([
            { name: 'AD', correlationMode: 'none' },
        ])

        await testConnection(registry, {})

        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(schemas.getManagedSourceSchemaAttributeNames).not.toHaveBeenCalled()
        expect(sources.ensureReverseCorrelationSetup).not.toHaveBeenCalled()
    })
})
