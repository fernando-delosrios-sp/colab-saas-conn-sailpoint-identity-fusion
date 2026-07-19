import { AggregationTracker } from '../../../services/fusionService/aggregationTracker'
import { FakeApiAdapter } from '../chain/harness/fakeApiAdapter'
import { ClientService } from '../../../services/clientService'

export type SourceConfigLike = {
    name: string
    correlationMode: 'none' | 'correlate' | 'reverse'
    sourceType?: 'authoritative' | 'record' | 'orphan'
    aggregationMode?: 'none' | 'before' | 'delayed'
    aggregationDelay?: number
    optimizedAggregation?: boolean
    disableNonMatchingAccounts?: boolean
    correlationAttribute?: string
    correlationDisplayName?: string
}

function createOperationTimer() {
    return {
        phase: vi.fn(),
        end: vi.fn(),
        totalElapsed: vi.fn(() => 0),
    }
}

export function createBaseOperationRegistry(sourceConfigs: SourceConfigLike[]) {
    const timer = createOperationTimer()

    const schemas = {
        setFusionAccountSchema: vi.fn().mockResolvedValue(undefined),
        loadFusionAccountSchemaFromSource: vi.fn().mockResolvedValue(undefined),
        getManagedSourceSchemaAttributeNames: vi.fn().mockResolvedValue(new Set<string>()),
    }

    const sources = {
        fetchAllSources: vi.fn().mockResolvedValue(undefined),
        validateAccountJmespathFilters: vi.fn(),
        setProcessLock: vi.fn().mockResolvedValue(undefined),
        releaseProcessLock: vi.fn().mockResolvedValue(undefined),
        resetBatchCumulativeCount: vi.fn().mockResolvedValue(undefined),
        ensureReverseCorrelationSetup: vi.fn().mockResolvedValue(undefined),
        clearReverseCorrelationReadinessCache: vi.fn(),
        setupReverseCorrelationSources: vi.fn().mockImplementation((_schemaAttrNames: Set<string>) => Promise.resolve(0)),
        aggregateManagedSources: vi.fn().mockResolvedValue(undefined),
        aggregateDelayedSources: vi.fn().mockResolvedValue(undefined),
        fetchFusionAccounts: vi.fn().mockResolvedValue(undefined),
        fetchFusionAccount: vi.fn().mockResolvedValue(undefined),
        fetchManagedAccounts: vi.fn().mockResolvedValue(undefined),
        fetchManagedAccount: vi.fn().mockResolvedValue(undefined),
        saveBatchCumulativeCount: vi.fn().mockResolvedValue(undefined),
        clearManagedAccounts: vi.fn(),
        clearFusionAccounts: vi.fn(),
        getSourceByName: vi.fn(),
        getSourceByNameSafe: vi.fn(),
        get delayedAggregationSources() {
            return sourceConfigs.filter((sc) => sc.aggregationMode === 'delayed')
        },
        get reverseCorrelationSources() {
            return sourceConfigs.filter((sc) => sc.correlationMode === 'reverse')
        },
        managedSources: [],
        fusionRun: { managedAccountsById: new Map() },
        managedAccountsById: new Map(),
        managedAccountsAllById: new Map(),
        managedAccountsByIdentityId: new Map(),
        fusionAccountsByNativeIdentity: new Map(),
        fusionAccountCount: 0,
        hasFusionSource: true,
        fusionSourceOwner: { id: 'fusion-owner' },
    }
    sources.getSourceByNameSafe.mockImplementation((sourceName?: string | null) =>
        sourceName ? sources.getSourceByName(sourceName) : undefined
    )

    const identities = {
        fetchIdentities: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn(),
        getIdentityById: vi.fn(),
        fetchIdentityById: vi.fn().mockResolvedValue(undefined),
        identityCount: 0,
    }

    const forms = {
        deleteExistingForms: vi.fn().mockResolvedValue(undefined),
        fetchFormData: vi.fn().mockResolvedValue(undefined),
        fetchFormInstances: vi.fn().mockResolvedValue(undefined),
        processFetchedFormData: vi.fn().mockResolvedValue(undefined),
        cleanUpForms: vi.fn().mockResolvedValue(undefined),
        awaitPendingDeleteOperations: vi.fn().mockResolvedValue(undefined),
        fusionIdentityDecisions: [],
    }

    let activeTracker: any = null
    const fusion = {
        setTracker: vi.fn().mockImplementation((t) => { activeTracker = t }),
        getTracker: vi.fn().mockImplementation(() => activeTracker || new AggregationTracker()),
        isReset: vi.fn(() => false),
        disableReset: vi.fn().mockResolvedValue(undefined),
        resetState: vi.fn().mockResolvedValue(undefined),
        processFusionAccounts: vi.fn().mockResolvedValue([]),
        processFusionAccount: vi.fn().mockImplementation(async (account) => account),
        processIdentities: vi.fn().mockResolvedValue([]),
        processIdentity: vi.fn().mockResolvedValue(undefined),
        getFusionIdentity: vi.fn().mockImplementation((id) => ({
            managedKey: id,
            addStatus: vi.fn(),
            enable: vi.fn(),
            disable: vi.fn(),
        })),
        preProcessFusionAccounts: vi.fn().mockResolvedValue([]),
        normalizePendingFormStateForOutput: vi.fn().mockResolvedValue(undefined),
        getISCAccount: vi.fn().mockImplementation(async (account) => account),
        correlateMissingAccountsPerSource: vi.fn().mockResolvedValue(undefined),
        processFusionIdentityDecisions: vi.fn().mockResolvedValue([]),
        initializeManagedAccountProcessing: vi.fn().mockResolvedValue(undefined),
        processCorrelatedManagedAccounts: vi.fn().mockResolvedValue(undefined),
        processUncorrelatedManagedAccounts: vi.fn().mockResolvedValue({ processed: 0, matchScoringMs: 0 }),
        processManagedAccounts: vi.fn().mockResolvedValue(undefined),
        awaitPendingDisableOperations: vi.fn().mockResolvedValue(undefined),
        refreshUniqueAttributes: vi.fn().mockResolvedValue(0),
        reconcilePendingFormState: vi.fn(),
        forEachISCAccount: vi.fn().mockResolvedValue({ sent: 0, eligible: 0 }),
        fusionReportOnAggregation: false,
    }

    const messaging = {
        fetchSender: vi.fn().mockResolvedValue(undefined),
        fetchDelayedAggregationSender: vi.fn().mockResolvedValue(undefined),
        scheduleDelayedAggregation: vi.fn().mockResolvedValue(undefined),
    }

    const define = {
        initializeCounters: vi.fn().mockResolvedValue(undefined),
        registerUniqueValuesFromManagedSourceAccounts: vi.fn(),
        refreshUniqueAttributes: vi.fn().mockResolvedValue(undefined),
        saveState: vi.fn().mockResolvedValue(undefined),
}

    const fakeAdapter = new FakeApiAdapter(sourceConfigs as any)
    const client = new ClientService(fakeAdapter, null, { sources: sourceConfigs } as any, { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as any)

    const registry = {
        config: { sources: sourceConfigs },
        log: {
            info: vi.fn(),
            debug: vi.fn(),
            crash: vi.fn(),
            timer: vi.fn(() => timer),
            metric: vi.fn(),
            track: vi.fn(() => ({ done: vi.fn(() => 0), elapsedMs: vi.fn(() => 0) })),
        },
        res: { send: vi.fn() },
        schemas,
        sources,
        identities,
        forms,
        fusion,
        messaging,
        define,
        client,
    } as any

    return { registry, timer, schemas, sources, identities, forms, fusion, client }
}
