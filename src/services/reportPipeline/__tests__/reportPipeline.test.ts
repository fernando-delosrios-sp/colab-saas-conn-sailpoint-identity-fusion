import { ClientService } from '../../clientService'
import { DryRunApiAdapter } from '../../clientService/dryRunApiAdapter'
import { IscApiAdapter } from '../../clientService/iscApiAdapter'
import { ServiceRegistry } from '../../serviceRegistry'
import { FusionConfig } from '../../../model/config'
import { runReportPipeline } from '../index'
import { createOperationTestRegistry } from '../../../operations/__tests__/harness/operationTestRegistry'

vi.mock('../../clientService/sdkApiAdapter', () => ({
    SdkApiAdapter: class MockSdkApiAdapter {
        config = {}
        accountsApi = {}
        identitiesApi = {}
        searchApi = {}
        sourcesApi = {}
        customFormsApi = {}
        workflowsApi = {}
        entitlementsApi = {}
        transformsApi = {}
        governanceGroupsApi = {}
        taskManagementApi = {}
        identityProfilesApi = {}
        identityAttributesApi = {}
    },
}))

function stubPhases(registry: ServiceRegistry): void {
    const sources = registry.sources as any
    sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
    sources.fetchFusionAccounts = vi.fn().mockResolvedValue(undefined)
    sources.fetchManagedAccounts = vi.fn().mockResolvedValue(undefined)
    sources.aggregateManagedSources = vi.fn().mockResolvedValue(undefined)
    sources.setupReverseCorrelationSources = vi.fn().mockResolvedValue(0)
    sources.clearReverseCorrelationReadinessCache = vi.fn()
    sources.validateAccountJmespathFilters = vi.fn()
    Object.defineProperty(sources, 'hasFusionSource', { get: () => true, configurable: true })
    Object.defineProperty(sources, 'managedSources', { get: () => [], configurable: true })

    const schemas = registry.schemas as any
    schemas.loadFusionAccountSchemaFromSource = vi.fn().mockResolvedValue(undefined)
    schemas.getManagedSourceSchemaAttributeNames = vi.fn().mockResolvedValue(new Set())

    const identities = registry.identities as any
    identities.fetchIdentities = vi.fn().mockResolvedValue(undefined)
    identities.clear = vi.fn()
    identities.hydrateMissingIdentitiesById = vi.fn().mockResolvedValue(undefined)

    const forms = registry.forms as any
    forms.fetchFormInstances = vi.fn().mockResolvedValue(undefined)
    forms.fetchFormData = vi.fn().mockResolvedValue(undefined)
    forms.processFetchedFormData = vi.fn().mockResolvedValue(undefined)

    const fusion = registry.fusion as any
    fusion.isResetAccounts = vi.fn().mockReturnValue(false)
    fusion.isResetForms = vi.fn().mockReturnValue(false)
    fusion.ensureGlobalReviewerOwnersInScope = vi.fn().mockResolvedValue(undefined)
    fusion.preProcessFusionAccounts = vi.fn().mockResolvedValue([])
    fusion.processFusionAccounts = vi.fn().mockResolvedValue([])
    fusion.processIdentities = vi.fn().mockResolvedValue([])
    fusion.processFusionIdentityDecisions = vi.fn().mockResolvedValue([])
    fusion.initializeManagedAccountProcessing = vi.fn().mockResolvedValue(undefined)
    fusion.processCorrelatedManagedAccounts = vi.fn().mockResolvedValue(undefined)
    fusion.processRecordUniqueRegistration = vi.fn().mockResolvedValue({ registered: 0 })
    fusion.processUncorrelatedManagedAccounts = vi.fn().mockResolvedValue({ processed: 0, matchScoringMs: 0 })
    fusion.awaitPendingDisableOperations = vi.fn().mockResolvedValue(undefined)
    fusion.reconcilePendingFormState = vi.fn()
    vi.spyOn(fusion, 'forEachISCAccount')

    vi.spyOn(registry.reports, 'generateAndSendFusionReport').mockResolvedValue(undefined)
    vi.spyOn(registry.definition, 'initializeCounters').mockResolvedValue(undefined)
}

describe('runReportPipeline', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('dispatches Fusion report delivery without Output streaming (injected-client harness)', async () => {
        const registry = createOperationTestRegistry()
        const activateSpy = vi.spyOn(registry, 'activateDryRunMode')
        const forEachSpy = vi.spyOn(registry.fusion, 'forEachISCAccount')

        await runReportPipeline(registry, false)

        expect(activateSpy).toHaveBeenCalledTimes(1)
        expect(registry.run.isDryRunMode).toBe(true)
        expect(forEachSpy).not.toHaveBeenCalled()
        expect(registry.res.send).not.toHaveBeenCalled()
        expect(registry.reports.generateAndSendFusionReport).toHaveBeenCalledWith(
            false,
            expect.anything(),
            'fusion'
        )
    })

    it('Fusion report contract: wraps DryRunApiAdapter, inhibits writes, skips Output, emails fusion kind', async () => {
        const wrapSpy = vi.spyOn(ClientService.prototype, 'wrapAdapter')
        const registry = new ServiceRegistry(
            {
                sources: [{ name: 'fusion', correlationMode: 'none' }],
                baseurl: 'https://test.example.com',
                spConnectorInstanceId: 'test-instance',
                recording: { mode: 'off' },
            } as unknown as FusionConfig,
            {} as any,
            { send: vi.fn() } as any,
            'accountUpdate'
        )
        stubPhases(registry)

        await runReportPipeline(registry, false)

        expect(registry.run.isDryRunMode).toBe(true)
        expect(wrapSpy).toHaveBeenCalledTimes(1)
        const innerWrite = vi.fn().mockResolvedValue({ data: { id: 'acct-1' } })
        const inner = {
            config: {} as any,
            accountsApi: { updateAccount: innerWrite, createAccount: innerWrite, deleteAccount: innerWrite },
            identitiesApi: {},
            searchApi: {},
            sourcesApi: {},
            customFormsApi: {},
            workflowsApi: {},
            entitlementsApi: {},
            transformsApi: {},
            governanceGroupsApi: {},
            taskManagementApi: {},
            identityProfilesApi: {},
            identityAttributesApi: {},
        } as unknown as IscApiAdapter
        const adapter = wrapSpy.mock.calls[0][0](inner)
        expect(adapter).toBeInstanceOf(DryRunApiAdapter)
        await (adapter as DryRunApiAdapter).accountsApi.updateAccount({ id: 'acct-1' } as any)
        expect(innerWrite).not.toHaveBeenCalled()
        expect(registry.fusion.forEachISCAccount).not.toHaveBeenCalled()
        expect(registry.res.send).not.toHaveBeenCalled()
        expect(registry.reports.generateAndSendFusionReport).toHaveBeenCalledWith(
            false,
            expect.anything(),
            'fusion'
        )
    })
})
