import { ConnectorError } from '@sailpoint/connector-sdk'
import { accountEnable } from '../accountEnable'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'
import type { Mock } from 'vitest'

vi.mock('../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: vi.fn(),
}))

import { createTestRegistry } from './harness/testRegistry'

function createRegistry() {
    const registry = createTestRegistry({
        sourceConfigs: [{ name: 'fusion', correlationMode: 'none' }],
    })

    const sources = registry.sources as any
    sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
    sources.fetchFusionAccounts = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(sources, 'fusionAccounts', { value: [], writable: true, configurable: true })

    const schemas = registry.schemas as any
    schemas.setFusionAccountSchema = vi.fn().mockResolvedValue(undefined)

    const definition = registry.definition as any
    definition.initializeCounters = vi.fn().mockResolvedValue(undefined)
    definition.registerUniqueValuesFromManagedSourceAccounts = vi.fn()
    definition.refreshUniqueAttributes = vi.fn().mockResolvedValue(undefined)

    const fusion = registry.fusion as any
    fusion.preProcessFusionAccounts = vi.fn().mockResolvedValue([])
    fusion.getISCAccount = vi.fn().mockResolvedValue({ id: 'isc-enabled' })
    fusion.normalizePendingFormStateForOutput = vi.fn().mockResolvedValue(undefined)

    const log = registry.log as any
    log.crash = vi.fn()

    return registry
}

describe('accountEnable', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('pre-processes unique attributes and enables account', async () => {
        const registry = createRegistry()
        registry.fusion.getISCAccount.mockResolvedValue({ id: 'isc-enabled' })
        const fusionAccount = { managedKey: 'fusion-1', enable: vi.fn() }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(fusionAccount)

        await accountEnable(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)

        expect(registry.definition.initializeCounters).toHaveBeenCalledTimes(1)
        expect(registry.sources.fetchFusionAccounts).toHaveBeenCalledTimes(1)
        expect(registry.definition.registerUniqueValuesFromManagedSourceAccounts).toHaveBeenCalledWith(
            registry.sources.fusionAccounts
        )
        expect(registry.fusion.preProcessFusionAccounts).toHaveBeenCalledTimes(1)
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
        expect(registry.definition.refreshUniqueAttributes).toHaveBeenCalledWith(fusionAccount)
        expect(fusionAccount.enable).toHaveBeenCalledTimes(1)
        expect(registry.fusion.normalizePendingFormStateForOutput).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-enabled' })
    })

    it('throws ConnectorError when caught', async () => {
        const registry = createRegistry()
        const error = new ConnectorError('Connector error')
        ;(rebuildFusionAccount as Mock).mockRejectedValue(error)

        await expect(
            accountEnable(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)
        ).rejects.toThrow(ConnectorError)
    })

    it('logs crash when non-ConnectorError is caught', async () => {
        const registry = createRegistry()
        const error = new Error('Generic error')
        ;(rebuildFusionAccount as Mock).mockRejectedValue(error)

        await accountEnable(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)

        expect(registry.log.crash).toHaveBeenCalledWith('Failed to enable account fusion-1', error)
    })
})
