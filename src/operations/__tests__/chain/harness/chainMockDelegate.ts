import { ChainState } from '../framework/ChainState'
import { StepDefinition, ScenararioConfig } from '../framework/ChainRunner'
import { MockRegistry } from '../framework/ChainContext'

function createOperationTimer() {
    return {
        phase: jest.fn(),
        end: jest.fn(),
        totalElapsed: jest.fn(() => 0),
    }
}

export function createChainMockRegistry(
    config: ScenararioConfig,
    step: StepDefinition,
    state: ChainState
): MockRegistry {
    const timer = createOperationTimer()
    const pass = step.pass ?? 1

    const schemas = {
        buildDynamicSchema: jest.fn().mockResolvedValue(buildMockSchema(config)),
        setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
        loadFusionAccountSchemaFromSource: jest.fn().mockResolvedValue(undefined),
        getManagedSourceSchemaAttributeNames: jest.fn().mockResolvedValue(new Set<string>()),
    }

    const sources = {
        fetchAllSources: jest.fn().mockResolvedValue(undefined),
        getSourceByName: jest.fn().mockImplementation((name: string) => {
            const sourceConfigs = (config.sources as Array<Record<string, unknown>>) ?? []
            return sourceConfigs.find((s) => s.name === name) ?? undefined
        }),
        getSourceByNameSafe: jest.fn().mockImplementation((name?: string | null) => {
            const sourceConfigs = (config.sources as Array<Record<string, unknown>>) ?? []
            return name ? sourceConfigs.find((s) => s.name === name) : undefined
        }),
        fetchManagedAccounts: jest.fn().mockResolvedValue(undefined),
        fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
        fetchFusionAccount: jest.fn().mockResolvedValue(undefined),
        clearManagedAccounts: jest.fn(),
        clearFusionAccounts: jest.fn(),
        clearReverseCorrelationReadinessCache: jest.fn(),
        ensureReverseCorrelationSetup: jest.fn().mockResolvedValue(undefined),
        validateAccountJmespathFilters: jest.fn(),
        setProcessLock: jest.fn().mockResolvedValue(undefined),
        releaseProcessLock: jest.fn().mockResolvedValue(undefined),
        resetBatchCumulativeCount: jest.fn().mockResolvedValue(undefined),
        saveBatchCumulativeCount: jest.fn().mockResolvedValue(undefined),
        aggregateManagedSources: jest.fn().mockResolvedValue(undefined),
        aggregateDelayedSources: jest.fn().mockResolvedValue(undefined),
        isCascadeAggregationEnabled: false,
        managedSources: [],
        managedAccountsById: new Map(),
        managedAccountsAllById: new Map(),
        fusionAccounts: state.getFusionAccounts().map((a) => ({ ...a })),
        fusionAccountsByNativeIdentity: new Map(
            state.getFusionAccounts().map((a) => [a.nativeIdentity, { ...a }])
        ),
        fusionAccountCount: state.getFusionAccounts().length,
        hasFusionSource: true,
        fusionSourceOwner: { id: 'source-owner-1', name: 'Source Owner' },
    }

    const identities = {
        fetchIdentities: jest.fn().mockImplementation(async () => {
            identities.identityCount = state.getIdentities().length
        }),
        fetchIdentityByName: jest.fn().mockImplementation(async (name: string) => {
            return state.getIdentityByName(name) ?? null
        }),
        fetchIdentityById: jest.fn().mockImplementation(async (id: string) => {
            const found = state.getIdentityById(id)
            if (found) {
                identities.getIdentityById.mockReturnValue(found)
            }
        }),
        getIdentityById: jest.fn().mockImplementation((id: string) => {
            return state.getIdentityById(id)
        }),
        clear: jest.fn(),
        identityCount: state.getIdentities().length,
    }

    const forms = {
        deleteExistingForms: jest.fn().mockResolvedValue(undefined),
        fetchFormData: jest.fn().mockResolvedValue(undefined),
        fetchFormInstancesData: jest.fn().mockResolvedValue(undefined),
        processFetchedFormData: jest.fn().mockResolvedValue(undefined),
        cleanUpForms: jest.fn().mockResolvedValue(undefined),
        awaitPendingDeleteOperations: jest.fn().mockResolvedValue(undefined),
    }

    const fusion = {
        isReset: jest.fn(() => false),
        disableReset: jest.fn().mockResolvedValue(undefined),
        resetState: jest.fn().mockResolvedValue(undefined),
        preProcessFusionAccounts: jest.fn().mockResolvedValue(undefined),
        processFusionAccounts: jest.fn().mockResolvedValue(undefined),
        processIdentity: jest.fn().mockResolvedValue(undefined),
        processIdentities: jest.fn().mockResolvedValue(undefined),
        processFusionIdentityDecisions: jest.fn().mockResolvedValue(undefined),
        processManagedAccounts: jest.fn().mockResolvedValue(undefined),
        awaitPendingDisableOperations: jest.fn().mockResolvedValue(undefined),
        refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
        reconcilePendingFormState: jest.fn(),
        clearAnalyzedAccounts: jest.fn(),
        forEachISCAccount: jest.fn().mockImplementation(
            async (sendFn: (account: unknown) => void) => {
                const accounts = state.getFusionAccounts()
                for (const account of accounts) {
                    if (!account.disabled) {
                        sendFn(account)
                    }
                }
                return accounts.filter((a) => !a.disabled).length
            }
        ),
        getFusionIdentity: jest.fn().mockReturnValue({
            nativeIdentity: 'fusion-identity',
            addStatus: jest.fn(),
        }),
        normalizePendingFormStateForOutput: jest.fn().mockResolvedValue(undefined),
        getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-account-1' }),
        analyzeUncorrelatedAccounts: jest.fn(),
        processFusionAccount: jest.fn().mockResolvedValue(undefined),
        generateReport: jest.fn(),
        fusionReportOnAggregation: false,
        fusionOwnerIsGlobalReviewer: config.fusionOwnerIsGlobalReviewer ?? true,
        fusionMergingExactMatch: config.fusionMergingExactMatch ?? false,
        fusionAverageScore: config.fusionAverageScore ?? 80,
    }

    const entitlements = {
        listStatusEntitlements: jest.fn().mockReturnValue([
            { attribute: 'statuses', value: 'enabled' },
            { attribute: 'statuses', value: 'disabled' },
            { attribute: 'statuses', value: 'locked' },
        ]),
        listActionEntitlements: jest.fn().mockReturnValue([
            { attribute: 'actions', value: 'correlate' },
            { attribute: 'actions', value: 'report' },
            { attribute: 'actions', value: 'report:high' },
        ]),
    }

    const attributes = {
        initializeCounters: jest.fn().mockResolvedValue(undefined),
        registerUniqueValuesFromRawAccounts: jest.fn(),
        refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
        saveState: jest.fn().mockResolvedValue(undefined),
    }

    const messaging = {
        fetchSender: jest.fn().mockResolvedValue(undefined),
        fetchDelayedAggregationSender: jest.fn().mockResolvedValue(undefined),
        sendReportTo: jest.fn().mockResolvedValue(undefined),
        renderFusionReportHtml: jest.fn().mockReturnValue('<html></html>'),
        scheduleDelayedAggregation: jest.fn().mockResolvedValue(undefined),
    }

    const registry = {
        config: { ...config, sources: config.sources ?? [] },
        log: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            crash: jest.fn(),
            timer: jest.fn(() => timer),
            flush: jest.fn().mockResolvedValue(undefined),
        },
        res: { send: jest.fn() },
        schemas,
        sources,
        identities,
        forms,
        fusion,
        entitlements,
        attributes,
        messaging,
    }

    applyStepMocks(registry, step, state, pass)

    return registry
}

function buildMockSchema(config: ScenararioConfig) {
    const attrs: Array<{ name: string; type: string; multi: boolean; entitlement: boolean; managed: boolean }> = [
        { name: 'displayName', type: 'string', multi: false, entitlement: false, managed: false },
        { name: 'email', type: 'string', multi: false, entitlement: false, managed: false },
        { name: 'fullName', type: 'string', multi: false, entitlement: false, managed: false },
        { name: 'department', type: 'string', multi: false, entitlement: false, managed: false },
        { name: 'title', type: 'string', multi: false, entitlement: false, managed: false },
        { name: 'disabled', type: 'boolean', multi: false, entitlement: false, managed: false },
        { name: 'statuses', type: 'string', multi: true, entitlement: true, managed: true },
        { name: 'actions', type: 'string', multi: true, entitlement: true, managed: true },
        { name: 'reviews', type: 'string', multi: true, entitlement: false, managed: false },
    ]

    if (config.uniqueAttributeDefinitions && config.uniqueAttributeDefinitions.length > 0) {
        for (const ua of config.uniqueAttributeDefinitions) {
            attrs.push({
                name: (ua as Record<string, unknown>).name as string,
                type: 'string',
                multi: false,
                entitlement: false,
                managed: false,
            })
        }
    }

    if (config.normalAttributeDefinitions && config.normalAttributeDefinitions.length > 0) {
        for (const na of config.normalAttributeDefinitions) {
            attrs.push({
                name: (na as Record<string, unknown>).name as string,
                type: 'string',
                multi: false,
                entitlement: false,
                managed: false,
            })
        }
    }

    return {
        attributes: attrs,
        identityAttribute: 'name',
        displayAttribute: 'displayName',
        groupAttribute: 'department',
    }
}

function applyStepMocks(
    registry: Record<string, any>,
    step: StepDefinition,
    state: ChainState,
    pass: number
): void {
    const mockName = step.mockDelegate ?? step.operation

    if (mockName === 'accountDiscoverSchema') {
        registry.sources.fetchAllSources.mockResolvedValue(undefined)
    }

    if (mockName === 'entitlementList') {
        registry.sources.fetchAllSources.mockResolvedValue(undefined)
    }

    if (mockName === 'accountList') {
        const managedAccounts = state.getManagedAccounts(pass)
        registry.sources.fetchManagedAccounts.mockImplementation(async () => {
            const map = new Map<string, { id: string; sourceName: string }>()
            for (const account of managedAccounts) {
                map.set(account.id, account)
            }
            registry.sources.managedAccountsById = map
            registry.sources.managedAccountsAllById = new Map(map)
        })
        registry.identities.fetchIdentities.mockImplementation(async () => {
            registry.identities.identityCount = state.getIdentities().length
        })
    }

    if (mockName === 'accountCreate') {
        registry.identities.fetchIdentityByName.mockImplementation(async (name: string) => {
            const identity = state.getIdentityByName(name)
            if (!identity) {
                throw new Error(`Identity not found: ${name}`)
            }
            return identity
        })
        registry.fusion.processIdentity.mockImplementation(async (identity: Record<string, unknown>) => {
            const fusionIdentity = registry.fusion.getFusionIdentity()
            fusionIdentity.nativeIdentity = `fusion-${identity.id}`
            fusionIdentity.addStatus('requested', 'Status set by accountCreate operation')
        })
    }

    if (mockName === 'accountDisable') {
        registry.sources.fetchAllSources.mockResolvedValue(undefined)
        registry.schemas.setFusionAccountSchema.mockResolvedValue(undefined)
    }

    if (mockName === 'accountEnable') {
        registry.attributes.initializeCounters.mockResolvedValue(undefined)
        registry.sources.fetchFusionAccounts.mockResolvedValue(undefined)
        registry.attributes.registerUniqueValuesFromRawAccounts.mockImplementation(() => undefined)
        registry.fusion.preProcessFusionAccounts.mockResolvedValue(undefined)
    }

    if (mockName === 'accountRead') {
        registry.sources.fetchAllSources.mockResolvedValue(undefined)
        registry.schemas.setFusionAccountSchema.mockResolvedValue(undefined)
        registry.fusion.normalizePendingFormStateForOutput.mockResolvedValue(undefined)
        registry.fusion.getISCAccount.mockResolvedValue({ id: 'isc-read-1' })
    }

    if (mockName === 'accountUpdate') {
        registry.sources.fetchAllSources.mockResolvedValue(undefined)
        registry.schemas.setFusionAccountSchema.mockResolvedValue(undefined)
        registry.fusion.normalizePendingFormStateForOutput.mockResolvedValue(undefined)
        registry.fusion.getISCAccount.mockResolvedValue({ id: 'isc-updated-1' })
        registry.sources.fetchFusionAccount.mockImplementation(async (nativeId: string) => {
            const account = state.getFusionAccount(nativeId)
            if (account) {
                const map = registry.sources.fusionAccountsByNativeIdentity
                map.set(nativeId, {
                    nativeIdentity: nativeId,
                    identityId: account.identityId,
                    attributes: account.attributes ?? {},
                })
            }
        })
    }
}
