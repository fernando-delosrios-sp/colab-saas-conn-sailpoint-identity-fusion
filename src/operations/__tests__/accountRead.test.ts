import { accountRead } from '../accountRead'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'

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
        expect(rebuildFusionAccount).toHaveBeenCalledWith('fusion-1', expect.any(Object), registry)
        expect(registry.fusion.normalizePendingFormStateForOutput).toHaveBeenCalledTimes(1)
        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(fusionAccount)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-1' })
    })

    it('rejects when identity is missing', async () => {
        const registry = createRegistry()
        await expect(accountRead(registry, {} as any)).rejects.toBeTruthy()
    })
})
