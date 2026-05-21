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

export function createOperationTimer() {
    return {
        phase: jest.fn(),
        end: jest.fn(),
        totalElapsed: jest.fn(() => 0),
    }
}

export function createBaseOperationRegistry(sourceConfigs: SourceConfigLike[]) {
    const timer = createOperationTimer()

    const schemas = {
        setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
        loadFusionAccountSchemaFromSource: jest.fn().mockResolvedValue(undefined),
        getManagedSourceSchemaAttributeNames: jest.fn().mockResolvedValue(new Set<string>()),
    }

    const sources = {
        fetchAllSources: jest.fn().mockResolvedValue(undefined),
        validateAccountJmespathFilters: jest.fn(),
        setProcessLock: jest.fn().mockResolvedValue(undefined),
        releaseProcessLock: jest.fn().mockResolvedValue(undefined),
        resetBatchCumulativeCount: jest.fn().mockResolvedValue(undefined),
        ensureReverseCorrelationSetup: jest.fn().mockResolvedValue(undefined),
        clearReverseCorrelationReadinessCache: jest.fn(),
        setupReverseCorrelationSources: jest.fn().mockResolvedValue(0),
        aggregateManagedSources: jest.fn().mockResolvedValue(undefined),
        aggregateDelayedSources: jest.fn().mockResolvedValue(undefined),
        fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
        fetchManagedAccounts: jest.fn().mockResolvedValue(undefined),
        saveBatchCumulativeCount: jest.fn().mockResolvedValue(undefined),
        clearManagedAccounts: jest.fn(),
        clearFusionAccounts: jest.fn(),
        getSourceByName: jest.fn(),
        getSourceByNameSafe: jest.fn(),
        managedSources: [],
        managedAccountsById: new Map(),
        managedAccountsAllById: new Map(),
        fusionAccountCount: 0,
        hasFusionSource: true,
        fusionSourceOwner: { id: 'fusion-owner' },
    }
    sources.getSourceByNameSafe.mockImplementation((sourceName?: string | null) =>
        sourceName ? sources.getSourceByName(sourceName) : undefined
    )

    const identities = {
        fetchIdentities: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn(),
        getIdentityById: jest.fn(),
        fetchIdentityById: jest.fn().mockResolvedValue(undefined),
        identityCount: 0,
    }

    const forms = {
        deleteExistingForms: jest.fn().mockResolvedValue(undefined),
        fetchFormData: jest.fn().mockResolvedValue(undefined),
        fetchFormInstancesData: jest.fn().mockResolvedValue(undefined),
        processFetchedFormData: jest.fn().mockResolvedValue(undefined),
        cleanUpForms: jest.fn().mockResolvedValue(undefined),
        awaitPendingDeleteOperations: jest.fn().mockResolvedValue(undefined),
        fusionIdentityDecisions: [],
    }

    const fusion = {
        isReset: jest.fn(() => false),
        disableReset: jest.fn().mockResolvedValue(undefined),
        resetState: jest.fn().mockResolvedValue(undefined),
        processFusionAccounts: jest.fn().mockResolvedValue([]),
        processIdentities: jest.fn().mockResolvedValue([]),
        processFusionIdentityDecisions: jest.fn().mockResolvedValue([]),
        initializeManagedAccountProcessing: jest.fn().mockResolvedValue(undefined),
        processCorrelatedManagedAccounts: jest.fn().mockResolvedValue(undefined),
        processUncorrelatedManagedAccounts: jest.fn().mockResolvedValue({ processed: 0, matchScoringMs: 0 }),
        processManagedAccounts: jest.fn().mockResolvedValue(undefined),
        awaitPendingDisableOperations: jest.fn().mockResolvedValue(undefined),
        refreshUniqueAttributes: jest.fn().mockResolvedValue(0),
        reconcilePendingFormState: jest.fn(),
        clearAnalyzedAccounts: jest.fn(),
        forEachISCAccount: jest.fn().mockResolvedValue({ sent: 0, eligible: 0 }),
        fusionReportOnAggregation: false,
    }

    const messaging = {
        fetchSender: jest.fn().mockResolvedValue(undefined),
        fetchDelayedAggregationSender: jest.fn().mockResolvedValue(undefined),
        scheduleDelayedAggregation: jest.fn().mockResolvedValue(undefined),
    }

    const attributes = {
        initializeCounters: jest.fn().mockResolvedValue(undefined),
        saveState: jest.fn().mockResolvedValue(undefined),
    }

    const registry = {
        config: { sources: sourceConfigs },
        log: {
            info: jest.fn(),
            debug: jest.fn(),
            crash: jest.fn(),
            timer: jest.fn(() => timer),
            metric: jest.fn(),
            track: jest.fn(() => ({ done: jest.fn(() => 0), elapsedMs: jest.fn(() => 0) })),
        },
        res: { send: jest.fn() },
        schemas,
        sources,
        identities,
        forms,
        fusion,
        messaging,
        attributes,
    } as any

    return { registry, timer, schemas, sources, identities, forms, fusion }
}
