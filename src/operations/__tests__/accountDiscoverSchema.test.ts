import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { accountDiscoverSchema } from '../accountDiscoverSchema'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { createBaseOperationRegistry, SourceConfigLike } from './harness/mockRegistry'

function createMockRegistry(sourceConfigs: SourceConfigLike[] = []) {
    const { registry, sources, schemas, timer } = createBaseOperationRegistry(sourceConfigs)
    // Add buildDynamicSchema mock to the schemas object
    const schemasWithDynamic = schemas as any;
    schemasWithDynamic.buildDynamicSchema = jest.fn()
    registry.schemas = schemasWithDynamic;
    return { registry, sources, schemas: schemasWithDynamic, timer }
}

describe('accountDiscoverSchema', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('successfully discovers and returns account schema', async () => {
        const { registry, sources, schemas } = createMockRegistry()
        const mockSchema = { attributes: [{ name: 'testAttribute', type: 'string' }] }
        schemas.buildDynamicSchema.mockResolvedValue(mockSchema)
        sources.fetchAllSources.mockResolvedValue(undefined)

        await accountDiscoverSchema(registry)

        expect(ServiceRegistry.setCurrent).toHaveBeenCalledWith(registry)
        expect(registry.log.info).toHaveBeenCalledWith('Discovering account schema')
        expect(registry.log.timer).toHaveBeenCalled()
        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(schemas.buildDynamicSchema).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith(mockSchema)
    })

    it('propagates ConnectorError without crashing', async () => {
        const { registry, sources, schemas } = createMockRegistry()
        const error = new ConnectorError('test error', ConnectorErrorType.Generic)
        schemas.buildDynamicSchema.mockRejectedValue(error)
        sources.fetchAllSources.mockResolvedValue(undefined)

        await expect(accountDiscoverSchema(registry)).rejects.toThrow(error)

        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(schemas.buildDynamicSchema).toHaveBeenCalledTimes(1)
        expect(registry.res.send).not.toHaveBeenCalled()
        expect(registry.log.crash).not.toHaveBeenCalled()
    })

    it('calls log.crash for standard Error', async () => {
        const { registry, sources, schemas } = createMockRegistry()
        const error = new Error('test error')
        schemas.buildDynamicSchema.mockRejectedValue(error)
        sources.fetchAllSources.mockResolvedValue(undefined)

        await accountDiscoverSchema(registry)

        expect(sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(schemas.buildDynamicSchema).toHaveBeenCalledTimes(1)
        expect(registry.res.send).not.toHaveBeenCalled()
        expect(registry.log.crash).toHaveBeenCalledWith('Failed to discover account schema', error)
    })
})
