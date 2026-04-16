import { accountUpdate } from '../accountUpdate'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'
import { executeActions } from '../actions'

jest.mock('../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: jest.fn(),
}))

jest.mock('../actions', () => ({
    executeActions: jest.fn(),
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
            getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-updated' }),
        },
        res: {
            send: jest.fn(),
        },
    } as any
}

describe('accountUpdate', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('executes action entitlement changes and returns updated account', async () => {
        const registry = createRegistry()
        const fusionAccount = { nativeIdentity: 'fusion-1', name: 'Fusion User' }
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue(fusionAccount)

        const input = {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'actions', op: 'Add', value: 'correlate:id-1' }],
        } as any

        await accountUpdate(registry, input)

        expect(rebuildFusionAccount).toHaveBeenCalledWith('fusion-1', expect.any(Object), registry)
        expect(executeActions).toHaveBeenCalledWith(fusionAccount, input.changes[0], registry)
        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(fusionAccount)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-updated' })
    })

    it('logs crash for unsupported entitlement change attribute', async () => {
        const registry = createRegistry()
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue({ nativeIdentity: 'fusion-1' })

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'department', op: 'Add', value: 'IT' }],
        } as any)

        expect(registry.log.crash).toHaveBeenCalledWith('Unsupported entitlement change: department')
        expect(executeActions).not.toHaveBeenCalled()
    })
})
