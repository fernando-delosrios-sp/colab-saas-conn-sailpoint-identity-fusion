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

/**
 * Approximates the real objects limiter: bounded concurrency (default 25) and ordered results.
 */
export const mockLimiters = {
    runAll: async <T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, opts?: { maxConcurrent?: number }) => {
        const maxConcurrent = opts?.maxConcurrent ?? 25
        const out: R[] = new Array(items.length)
        for (let s = 0; s < items.length; s += maxConcurrent) {
            const end = Math.min(s + maxConcurrent, items.length)
            const batch = await Promise.all(items.slice(s, end).map((it, j) => fn(it, s + j)))
            for (let k = 0; k < batch.length; k++) out[s + k] = batch[k]
        }
        return out
    },
    objects: { schedule: (_o: any, f: () => any) => f() },
    api: { schedule: (_o: any, f: () => any) => f() },
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
    }

    const fusion = {
        isReset: jest.fn(() => false),
        disableReset: jest.fn().mockResolvedValue(undefined),
        resetState: jest.fn().mockResolvedValue(undefined),
        processFusionAccounts: jest.fn().mockResolvedValue(undefined),
        processIdentities: jest.fn().mockResolvedValue(undefined),
        processFusionIdentityDecisions: jest.fn().mockResolvedValue(undefined),
        processManagedAccounts: jest.fn().mockResolvedValue(undefined),
        awaitPendingDisableOperations: jest.fn().mockResolvedValue(undefined),
        refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
        reconcilePendingFormState: jest.fn(),
        clearAnalyzedAccounts: jest.fn(),
        forEachISCAccount: jest.fn().mockResolvedValue(0),
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
            crash: jest.fn(),
            timer: jest.fn(() => timer),
        },
        res: { send: jest.fn() },
        client: { getLimiters: () => mockLimiters },
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
