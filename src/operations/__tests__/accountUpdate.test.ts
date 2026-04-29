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
        config: {
            sources: [],
        },
        log: {
            info: jest.fn(),
            debug: jest.fn(),
            crash: jest.fn(),
            timer: jest.fn(() => timer),
        },
        sources: {
            fetchAllSources: jest.fn().mockResolvedValue(undefined),
            fetchFusionAccount: jest.fn().mockResolvedValue(undefined),
            fusionAccountsByNativeIdentity: new Map(),
        },
        schemas: {
            setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
        },
        forms: {},
        fusion: {
            normalizePendingFormStateForOutput: jest.fn().mockResolvedValue(undefined),
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
        expect(registry.fusion.normalizePendingFormStateForOutput).not.toHaveBeenCalled()
        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(fusionAccount, true, true)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-updated' })
    })

    it('skips correlation status recompute when removing correlated action', async () => {
        const registry = createRegistry()
        const fusionAccount = { nativeIdentity: 'fusion-1', name: 'Fusion User' }
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue(fusionAccount)

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'actions', op: 'Remove', value: 'correlated' }],
        } as any)

        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(fusionAccount, true, false)
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

    it('preserves reverse correlation attributes as-is during account update', async () => {
        const registry = createRegistry()
        registry.config.sources = [{ name: 'HR', correlationMode: 'reverse', correlationAttribute: 'reverseNativeIdentity' }]
        registry.sources.fusionAccountsByNativeIdentity.set('fusion-1', {
            attributes: {
                reverseNativeIdentity: 'native-before-update',
            },
        })
        const fusionAccount = {
            nativeIdentity: 'fusion-1',
            attributes: {
                reverseNativeIdentity: 'native-after-rebuild',
            },
        }
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue(fusionAccount)
        ;(executeActions as jest.Mock).mockImplementation(async (account) => {
            account.attributes.reverseNativeIdentity = 'native-after-action'
        })

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'actions', op: 'Add', value: 'correlate:id-1' }],
        } as any)

        expect(registry.sources.fetchFusionAccount).toHaveBeenCalledWith('fusion-1')
        expect(fusionAccount.attributes.reverseNativeIdentity).toBe('native-before-update')
    })
})
