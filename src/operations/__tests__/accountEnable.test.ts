import { accountEnable } from '../accountEnable'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'

jest.mock('../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: jest.fn(),
}))

import { createRegistry as createMockRegistry } from './harness/registryMocking'

function createRegistry() {
    const registry = createMockRegistry()
    Object.assign(registry.fusion, { getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-enabled' }) })
    return registry
}

describe('accountEnable', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('pre-processes unique attributes and enables account', async () => {
        const registry = createRegistry()
        const fusionAccount = { nativeIdentity: 'fusion-1', enable: jest.fn() }
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue(fusionAccount)

        await accountEnable(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)

        expect(registry.attributes.initializeCounters).toHaveBeenCalledTimes(1)
        expect(registry.sources.fetchFusionAccounts).toHaveBeenCalledTimes(1)
        expect(registry.attributes.registerUniqueValuesFromRawAccounts).toHaveBeenCalledWith(
            registry.sources.fusionAccounts
        )
        expect(registry.fusion.preProcessFusionAccounts).toHaveBeenCalledTimes(1)
        expect(rebuildFusionAccount).toHaveBeenCalledWith('fusion-1', expect.any(Object), registry)
        expect(registry.attributes.refreshUniqueAttributes).toHaveBeenCalledWith(fusionAccount)
        expect(fusionAccount.enable).toHaveBeenCalledTimes(1)
        expect(registry.fusion.normalizePendingFormStateForOutput).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-enabled' })
    })
})
