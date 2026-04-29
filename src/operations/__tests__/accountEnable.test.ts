import { accountEnable } from '../accountEnable'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'

jest.mock('../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: jest.fn(),
}))

function createRegistry() {
    const timer = {
        phase: jest.fn(),
        end: jest.fn(),
    }

    return {
        log: {
            info: jest.fn(),
            debug: jest.fn(),
            crash: jest.fn(),
            timer: jest.fn(() => timer),
        },
        sources: {
            fetchAllSources: jest.fn().mockResolvedValue(undefined),
            fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
            fusionAccounts: [{ id: 'fusion-existing-1' }],
        },
        schemas: {
            setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
        },
        forms: {
            fetchFormData: jest.fn().mockResolvedValue(undefined),
        },
        fusion: {
            preProcessFusionAccounts: jest.fn().mockResolvedValue(undefined),
            reconcilePendingFormState: jest.fn(),
            getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-enabled' }),
        },
        attributes: {
            initializeCounters: jest.fn().mockResolvedValue(undefined),
            registerUniqueValuesFromRawAccounts: jest.fn(),
            refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
        },
        res: {
            send: jest.fn(),
        },
    } as any
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
        expect(registry.attributes.registerUniqueValuesFromRawAccounts).toHaveBeenCalledWith(registry.sources.fusionAccounts)
        expect(registry.fusion.preProcessFusionAccounts).toHaveBeenCalledTimes(1)
        expect(rebuildFusionAccount).toHaveBeenCalledWith('fusion-1', expect.any(Object), registry)
        expect(registry.attributes.refreshUniqueAttributes).toHaveBeenCalledWith(fusionAccount)
        expect(fusionAccount.enable).toHaveBeenCalledTimes(1)
        expect(registry.forms.fetchFormData).toHaveBeenCalledTimes(1)
        expect(registry.fusion.reconcilePendingFormState).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-enabled' })
    })
})
