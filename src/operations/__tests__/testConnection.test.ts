import { testConnection } from '../testConnection'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { createBaseOperationRegistry, SourceConfigLike } from './harness/mockRegistry'

function createMockRegistry(sourceConfigs: SourceConfigLike[]) {
    const { registry, sources, schemas, timer } = createBaseOperationRegistry(sourceConfigs)
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
        const { registry, sources, schemas } = createMockRegistry([{ name: 'AD', correlationMode: 'none' }])

        await testConnection(registry, {})

        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(schemas.getManagedSourceSchemaAttributeNames).not.toHaveBeenCalled()
        expect(sources.ensureReverseCorrelationSetup).not.toHaveBeenCalled()
    })
})
