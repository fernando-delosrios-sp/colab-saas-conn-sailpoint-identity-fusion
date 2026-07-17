import { accountUpdate } from '../accountUpdate'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'
import { executeActions } from '../actions'
import { FusionAction } from '../../model/fusionAction'
import type { Mock } from 'vitest'

vi.mock('../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: vi.fn(),
}))

vi.mock('../actions', () => ({
    executeActions: vi.fn(),
}))

import { createRegistry as createMockRegistry } from './harness/registryMocking'

function createRegistry() {
    const registry = createMockRegistry()
    Object.assign(registry.fusion, { getISCAccount: vi.fn().mockResolvedValue({ id: 'isc-updated' }) })
    return registry
}

describe('accountUpdate', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('executes action entitlement changes and returns updated account', async () => {
        const registry = createRegistry()
        const fusionAccount = { managedKey: 'fusion-1', name: 'Fusion User' }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(fusionAccount)

        const input = {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'actions', op: 'Add', value: 'correlate:id-1' }],
        } as any

        await accountUpdate(registry, input)

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
        expect(executeActions).toHaveBeenCalledWith(fusionAccount, input.changes[0], registry)
        expect(registry.fusion.normalizePendingFormStateForOutput).not.toHaveBeenCalled()
        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(fusionAccount, true, true)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-updated' })
    })

    it('skips correlation status recompute when removing correlated action', async () => {
        const registry = createRegistry()
        const fusionAccount = { managedKey: 'fusion-1', name: 'Fusion User' }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(fusionAccount)

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'actions', op: 'Remove', value: FusionAction.Correlated }],
        } as any)

        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(fusionAccount, true, false)
    })

    it('logs crash for unsupported entitlement change attribute', async () => {
        const registry = createRegistry()
        ;(rebuildFusionAccount as Mock).mockResolvedValue({ managedKey: 'fusion-1' })

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
        registry.config.sources = [
            { name: 'HR', correlationMode: 'reverse', correlationAttribute: 'reverseNativeIdentity' },
        ]
        registry.sources.fusionAccountsByNativeIdentity.set('fusion-1', {
            attributes: {
                reverseNativeIdentity: 'native-before-update',
            },
        })
        const fusionAccount = {
            managedKey: 'fusion-1',
            attributes: {
                reverseNativeIdentity: 'native-after-rebuild',
            } as Record<string, string>,
            setReverseCorrelationAttribute(attributeName: string, value: string) {
                this.attributes[attributeName] = value
            },
            clearReverseCorrelationAttribute(attributeName: string) {
                delete this.attributes[attributeName]
            },
        }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(fusionAccount)
        ;(executeActions as Mock).mockImplementation(async (account) => {
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
