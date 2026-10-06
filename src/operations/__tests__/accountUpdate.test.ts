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

import { createRegistry as createMockRegistry } from './harness/registryMocking'

function createRegistry() {
    const registry = createMockRegistry()
    Object.assign(registry.fusion, { getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-updated' }) })
    registry.log.error = jest.fn()
    return registry
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

    it('reports a status entitlement request as a provisioning error naming the account and status', async () => {
        const registry = createRegistry()
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue({
            nativeIdentity: '5017dbcd-1cef-4912-a9b4-a5254c9e4fa0',
            name: 'Jane Doe',
        })

        await accountUpdate(registry, {
            identity: '5017dbcd-1cef-4912-a9b4-a5254c9e4fa0',
            schema: { attributes: [] },
            changes: [{ attribute: 'statuses', op: 'Add', value: 'authorized' }],
        } as any)

        const message =
            'Account Jane Doe (5017dbcd-1cef-4912-a9b4-a5254c9e4fa0) cannot change status entitlements (add "authorized"). Status entitlements are assigned by Fusion and are not requestable.'
        expect(registry.log.crash).not.toHaveBeenCalled()
        expect(executeActions).not.toHaveBeenCalled()
        expect(registry.log.error).toHaveBeenCalledWith(message)
        expect(registry.res.send).toHaveBeenCalledWith({
            id: 'isc-updated',
            results: [
                {
                    attribute: 'statuses',
                    status: 'error',
                    messages: [{ level: 'ERROR', message }],
                },
            ],
        })
    })

    it('names every status in a remove or multi-value status request', async () => {
        const registry = createRegistry()
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue({ nativeIdentity: 'fusion-1' })

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [
                { attribute: 'statuses', op: 'Remove', value: 'orphan' },
                { attribute: 'statuses', op: 'Set', value: ['baseline', 'manual'] },
            ],
        } as any)

        expect(registry.log.error).toHaveBeenCalledWith(
            'Account fusion-1 cannot change status entitlements (remove "orphan"; set "baseline", "manual"). Status entitlements are assigned by Fusion and are not requestable.'
        )
        expect(registry.log.crash).not.toHaveBeenCalled()
        expect(registry.res.send).toHaveBeenCalled()
    })

    it('still applies action changes when a status entitlement is requested in the same update', async () => {
        const registry = createRegistry()
        const fusionAccount = { nativeIdentity: 'fusion-1', name: 'Fusion User' }
        ;(rebuildFusionAccount as jest.Mock).mockResolvedValue(fusionAccount)

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [
                { attribute: 'actions', op: 'Add', value: 'correlate:id-1' },
                { attribute: 'statuses', op: 'Add', value: 'authorized' },
            ],
        } as any)

        expect(executeActions).toHaveBeenCalledWith(
            fusionAccount,
            expect.objectContaining({ attribute: 'actions' }),
            registry
        )
        expect(registry.log.crash).not.toHaveBeenCalled()
        expect(registry.res.send).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'isc-updated',
                results: [
                    expect.objectContaining({
                        attribute: 'statuses',
                        status: 'error',
                    }),
                ],
            })
        )
    })

    it('preserves reverse correlation attributes as-is during account update', async () => {
        const registry = createRegistry()
        registry.config.sources = [
            { name: 'HR', correlationMode: 'reverse', correlationAttribute: 'reverseNativeIdentity' },
        ]
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
