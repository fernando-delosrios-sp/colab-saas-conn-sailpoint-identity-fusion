import { accountRead } from '../accountRead'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'

jest.mock('../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: jest.fn(),
}))

import { createRegistry as createMockRegistry } from './harness/registryMocking'

function createRegistry() {
    const registry = createMockRegistry()
    Object.assign(registry.fusion, { getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-1' }) })
    return registry
}

describe('accountRead', () => {
    beforeEach(() => {
        ServiceRegistry.clear()
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('rebuilds and returns a single ISC account', async () => {
        const registry = createRegistry()
        const fusionAccount = { nativeIdentity: 'fusion-1', name: 'Fusion User' }
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue(fusionAccount)

        await accountRead(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)

        expect(registry.sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(registry.schemas.setFusionAccountSchema).toHaveBeenCalledTimes(1)
        expect(rebuildFusionAccount).toHaveBeenCalledWith(
            'fusion-1',
            expect.any(Object),
            expect.objectContaining({
                fusion: expect.any(Object),
                identities: expect.any(Object),
                sources: expect.any(Object),
                log: expect.any(Object),
            })
        )
        expect(registry.fusion.normalizePendingFormStateForOutput).toHaveBeenCalledTimes(1)
        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(fusionAccount)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-1' })
    })

    it('rejects when identity is missing', async () => {
        const registry = createRegistry()
        await expect(accountRead(registry, {} as any)).rejects.toBeTruthy()
    })

    it('re-throws a ConnectorError when encountered', async () => {
        const registry = createRegistry()
        const error = new ConnectorError('Custom error', ConnectorErrorType.NotFound)
        registry.sources.fetchAllSources.mockRejectedValue(error)

        await expect(
            accountRead(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)
        ).rejects.toThrow(error)
        expect(registry.log.crash).not.toHaveBeenCalled()
    })

    it('crashes via log.crash when a non-ConnectorError is encountered', async () => {
        const registry = createRegistry()
        const error = new Error('Unexpected error')
        registry.sources.fetchAllSources.mockRejectedValue(error)

        await accountRead(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)
        expect(registry.log.crash).toHaveBeenCalledWith('Failed to read account fusion-1', error)
    })
})
