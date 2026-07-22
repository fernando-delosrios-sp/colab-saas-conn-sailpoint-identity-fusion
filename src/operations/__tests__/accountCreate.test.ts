import { accountCreate } from '../accountCreate'
import { executeActions } from '../actions'
import { StatusEntitlement } from '../../model/statusEntitlement'

vi.mock('../actions', () => ({
    executeActions: vi.fn(),
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
    Object.defineProperty(schemas, 'fusionDisplayAttribute', { value: 'name', writable: true, configurable: true })

    const definition = registry.definition as any
    definition.initializeCounters = vi.fn().mockResolvedValue(undefined)
    definition.registerUniqueValuesFromManagedSourceAccounts = vi.fn()
    definition.refreshUniqueAttributes = vi.fn().mockResolvedValue(undefined)

    const fusion = registry.fusion as any
    fusion.preProcessFusionAccounts = vi.fn().mockResolvedValue([])
    fusion.processIdentity = vi.fn().mockResolvedValue(undefined)
    fusion.getFusionIdentity = vi.fn().mockReturnValue({ managedKey: 'fusion-id-1', addStatus: vi.fn() })
    fusion.normalizePendingFormStateForOutput = vi.fn().mockResolvedValue(undefined)
    fusion.getISCAccount = vi.fn().mockResolvedValue({ id: 'isc-created' })

    const identities = registry.identities as any
    identities.fetchIdentityByName = vi.fn().mockResolvedValue({ id: 'id-1', name: 'Alice Doe' })

    const log = registry.log as any
    log.crash = vi.fn()
    log.metric = vi.fn()

    return registry
}

describe('accountCreate', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('creates fusion account from identity and executes actions', async () => {
        const registry = createRegistry()
        const input = {
            identity: 'Alice Doe',
            schema: { attributes: [] },
            attributes: {
                name: 'Alice Doe',
                actions: ['report:high', 'correlate:id-1'],
            },
        } as any

        await accountCreate(registry, input)

        expect(registry.identities.fetchIdentityByName).toHaveBeenCalledWith('Alice Doe')
        expect(registry.sources.fetchFusionAccounts).toHaveBeenCalledTimes(1)
        expect(registry.definition.registerUniqueValuesFromManagedSourceAccounts).toHaveBeenCalledWith(
            registry.sources.fusionAccounts
        )
        expect(registry.fusion.preProcessFusionAccounts).toHaveBeenCalledTimes(1)
        expect(registry.fusion.processIdentity).toHaveBeenCalledWith({ id: 'id-1', name: 'Alice Doe' })
        expect(registry.fusion.getFusionIdentity().addStatus).toHaveBeenCalledWith(
            StatusEntitlement.Requested,
            'Status set by accountCreate operation'
        )
        expect(executeActions).toHaveBeenCalledTimes(2)
        expect(registry.fusion.normalizePendingFormStateForOutput).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-created' })
    })

    it('executes a single report action when actions is a string (not char-split)', async () => {
        const registry = createRegistry()
        const input = {
            identity: 'Alice Doe',
            schema: { attributes: [] },
            attributes: {
                name: 'Alice Doe',
                actions: 'report',
            },
        } as any

        await accountCreate(registry, input)

        expect(executeActions).toHaveBeenCalledTimes(1)
        expect(executeActions).toHaveBeenCalledWith(
            registry.fusion.getFusionIdentity(),
            { op: expect.anything(), attribute: 'actions', value: 'report' },
            registry
        )
    })

    it('creates account using attributes.name when identity is missing', async () => {
        const registry = createRegistry()
        const input = {
            schema: { attributes: [] },
            attributes: {
                name: 'Alice Doe',
            },
        } as any

        await accountCreate(registry, input)

        expect(registry.identities.fetchIdentityByName).toHaveBeenCalledWith('Alice Doe')
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-created' })
    })
})
