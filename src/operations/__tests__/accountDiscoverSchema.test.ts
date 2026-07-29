import { accountDiscoverSchema } from '../accountDiscoverSchema'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { createTestRegistry } from './harness/testRegistry'

function createRegistry() {
    const registry = createTestRegistry({
        sourceConfigs: [{ name: 'fusion', correlationMode: 'none' }],
    })

    const sources = registry.sources as any
    sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)

    const schemas = registry.schemas as any
    schemas.buildDynamicSchema = vi.fn().mockResolvedValue({ attributes: [{ name: 'email' }] })

    const log = registry.log as any
    log.crash = vi.fn()

    return registry
}

describe('accountDiscoverSchema', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('fetches sources, builds dynamic schema, and sends result', async () => {
        const registry = createRegistry()
        const schema = { attributes: [{ name: 'email', type: 'string' }] }
        registry.schemas.buildDynamicSchema.mockResolvedValue(schema)

        await accountDiscoverSchema(registry)

        expect(registry.sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(registry.schemas.buildDynamicSchema).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith(schema)
    })

    it('re-throws ConnectorError without calling crash', async () => {
        const registry = createRegistry()
        const error = new ConnectorError('Schema unavailable', ConnectorErrorType.Generic)
        registry.schemas.buildDynamicSchema.mockRejectedValue(error)

        await expect(accountDiscoverSchema(registry)).rejects.toThrow(error)
        expect(registry.log.crash).not.toHaveBeenCalled()
    })

    it('calls crash for unexpected errors', async () => {
        const registry = createRegistry()
        registry.sources.fetchAllSources.mockRejectedValue(new Error('network failure'))

        await accountDiscoverSchema(registry)

        expect(registry.log.crash).toHaveBeenCalledWith(
            'Failed to discover account schema',
            expect.any(Error)
        )
    })
})
