import { entitlementList } from '../entitlementList'
import { createTestRegistry } from './harness/testRegistry'

function createRegistry() {
    const registry = createTestRegistry({
        sourceConfigs: [{ name: 'fusion', correlationMode: 'none' }],
    })

    const sources = registry.sources as any
    sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)

    const entitlements = registry.entitlements as any
    entitlements.listStatusEntitlements = vi.fn(() => [{ type: 'status', id: 'baseline' }])
    entitlements.listActionEntitlements = vi.fn(() => [{ type: 'action', id: 'report' }])

    const log = registry.log as any
    log.crash = vi.fn()

    return registry
}

describe('entitlementList', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('lists status entitlements without fetching sources', async () => {
        const registry = createRegistry()

        await entitlementList(registry, { type: 'status' } as any)

        expect(registry.sources.fetchAllSources).not.toHaveBeenCalled()
        expect(registry.entitlements.listStatusEntitlements).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ type: 'status', id: 'baseline' })
    })

    it('lists action entitlements after fetching sources', async () => {
        const registry = createRegistry()

        await entitlementList(registry, { type: 'action' } as any)

        expect(registry.sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(registry.entitlements.listActionEntitlements).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ type: 'action', id: 'report' })
    })

    it('rejects invalid entitlement type', async () => {
        const registry = createRegistry()

        await expect(entitlementList(registry, { type: 'invalid' } as any)).rejects.toMatchObject({
            message: 'Invalid entitlement type invalid',
        })
        expect(registry.log.crash).not.toHaveBeenCalled()
    })

    it('calls crash for unexpected errors', async () => {
        const registry = createRegistry()
        registry.entitlements.listStatusEntitlements.mockImplementation(() => {
            throw new Error('boom')
        })

        await entitlementList(registry, { type: 'status' } as any)

        expect(registry.log.crash).toHaveBeenCalledWith(
            'Failed to list entitlements for type status',
            expect.any(Error)
        )
    })
})
