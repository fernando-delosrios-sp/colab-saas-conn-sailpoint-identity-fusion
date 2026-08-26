import { accountCreate } from '../accountCreate'
import { executeActions } from '../actions'
import { StatusEntitlement } from '../../model/statusEntitlement'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'

vi.mock('../actions', () => ({
    executeActions: vi.fn(),
}))

vi.mock('../../services/reportPipeline', () => ({
    runReportPipeline: vi.fn(),
}))

import { createTestRegistry } from './harness/testRegistry'
import { runReportPipeline } from '../../services/reportPipeline'

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
    fusion.getFusionIdentity = vi.fn().mockReturnValue({ managedKey: 'fusion-id-1', collections: { statuses: { add: vi.fn() } } })
    fusion.normalizePendingFormStateForOutput = vi.fn().mockResolvedValue(undefined)
    fusion.getISCAccount = vi.fn().mockResolvedValue({ id: 'isc-created' })
    fusion.forEachISCAccount = vi.fn()

    const identities = registry.identities as any
    identities.fetchIdentityByName = vi.fn().mockResolvedValue({ id: 'id-1', name: 'Alice Doe' })

    const log = registry.log as any
    log.crash = vi.fn()
    log.metric = vi.fn()

    return registry
}

function mockCrashThrows(registry: ReturnType<typeof createRegistry>) {
    const log = registry.log as any
    log.crash = vi.fn((message: string) => {
        throw new ConnectorError(message, ConnectorErrorType.Generic)
    })
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
        expect(registry.fusion.getFusionIdentity().collections.statuses.add).toHaveBeenCalledWith(
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

    it('fails with observable message when identity is not found', async () => {
        const registry = createRegistry()
        mockCrashThrows(registry)
        registry.identities.fetchIdentityByName = vi.fn().mockResolvedValue(undefined)

        await expect(
            accountCreate(registry, {
                schema: { attributes: [] },
                attributes: { name: 'Missing User' },
            } as any)
        ).rejects.toMatchObject({ message: 'Identity not found: Missing User' })

        expect(registry.res.send).not.toHaveBeenCalled()
    })

    it('fails with observable message when schema is missing', async () => {
        const registry = createRegistry()
        mockCrashThrows(registry)

        await expect(accountCreate(registry, { attributes: { name: 'Alice Doe' } } as any)).rejects.toMatchObject({
            message: 'Account schema is required',
        })

        expect(registry.res.send).not.toHaveBeenCalled()
    })

    it('fails with observable message for unsupported action', async () => {
        const registry = createRegistry()
        mockCrashThrows(registry)
        const { executeActions: realExecuteActions } = await vi.importActual<typeof import('../actions')>(
            '../actions'
        )
        vi.mocked(executeActions).mockImplementation(realExecuteActions)

        await expect(
            accountCreate(registry, {
                schema: { attributes: [] },
                attributes: {
                    name: 'Alice Doe',
                    actions: ['unknown-action'],
                },
            } as any)
        ).rejects.toMatchObject({ message: 'Unsupported action: unknown-action' })

        expect(registry.res.send).not.toHaveBeenCalled()
    })

    it('dispatches Fusion report pipeline on report Add without streaming extra StdAccountListOutput objects', async () => {
        const registry = createRegistry()
        const { executeActions: realExecuteActions } = await vi.importActual<typeof import('../actions')>(
            '../actions'
        )
        vi.mocked(executeActions).mockImplementation(realExecuteActions)
        vi.mocked(runReportPipeline).mockResolvedValue(undefined)

        await accountCreate(registry, {
            identity: 'Alice Doe',
            schema: { attributes: [] },
            attributes: { name: 'Alice Doe', actions: ['report'] },
        } as any)

        expect(runReportPipeline).toHaveBeenCalledWith(registry, false)
        expect(registry.res.send).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-created' })
        expect(registry.fusion.forEachISCAccount).not.toHaveBeenCalled()
    })
})

