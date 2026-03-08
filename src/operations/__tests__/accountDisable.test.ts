import { accountDisable } from '../accountDisable'
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
        },
        schemas: {
            setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
        },
        fusion: {
            getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-disabled' }),
        },
        res: {
            send: jest.fn(),
        },
    } as any
}

describe('accountDisable', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('disables a fusion account and returns updated ISC account', async () => {
        const registry = createRegistry()
        const fusionAccount = { nativeIdentity: 'fusion-1', disable: jest.fn() }
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue(fusionAccount)

        await accountDisable(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)

        expect(registry.sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(registry.schemas.setFusionAccountSchema).toHaveBeenCalledTimes(1)
        expect(rebuildFusionAccount).toHaveBeenCalledWith('fusion-1', expect.any(Object), registry)
        expect(fusionAccount.disable).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-disabled' })
    })
})
