import { AggregationTracker } from '../../../services/fusionService/aggregationTracker'

export function createRegistry() {
    const timer = {
        phase: vi.fn(),
        end: vi.fn(),
        totalElapsed: vi.fn(() => 0),
        getPhaseBreakdown: vi.fn(),
        recordElapsed: vi.fn(),
    }

    const fusionIdentity = {
        managedKey: 'fusion-id-1',
        addStatus: vi.fn(),
    }

    const trackedOp = {
            done: vi.fn(() => 0),
            elapsedMs: vi.fn(() => 0),
        }
    let activeTracker: any = null
    return {
        config: {
            sources: [],
        },
        log: {
            info: vi.fn(),
            debug: vi.fn(),
            crash: vi.fn(),
            timer: vi.fn(() => timer),
            metric: vi.fn(),
            track: vi.fn(() => trackedOp),
        },
        identities: {
            fetchIdentityByName: vi.fn().mockResolvedValue({ id: 'id-1', name: 'Alice Doe' }),
        },
        sources: {
            fetchAllSources: vi.fn().mockResolvedValue(undefined),
            fetchFusionAccounts: vi.fn().mockResolvedValue(undefined),
            fetchFusionAccount: vi.fn().mockResolvedValue(undefined),
            fusionAccounts: [{ id: 'fusion-existing-1' }],
            fusionAccountsByNativeIdentity: new Map(),
            hasFusionSource: true,
            clearReverseCorrelationReadinessCache: vi.fn(),
            setupReverseCorrelationSources: vi.fn().mockImplementation((_schemaAttrNames: Set<string>) => Promise.resolve(0)),
            aggregateManagedSources: vi.fn().mockResolvedValue(undefined),
            run: { managedAccountsById: new Map() },
        },
        schemas: {
            setFusionAccountSchema: vi.fn().mockResolvedValue(undefined),
            getManagedSourceSchemaAttributeNames: vi.fn().mockResolvedValue(new Set<string>()),
            fusionDisplayAttribute: 'name',
        },
        forms: {
            fetchFormData: vi.fn().mockResolvedValue(undefined),
            fetchFormInstances: vi.fn().mockResolvedValue(undefined),
            processFetchedFormData: vi.fn().mockResolvedValue(undefined),
            cleanUpForms: vi.fn().mockResolvedValue(undefined),
            awaitPendingDeleteOperations: vi.fn().mockResolvedValue(undefined),
            fusionIdentityDecisions: [],
        },
        fusion: {
            setTracker: vi.fn().mockImplementation((t) => { activeTracker = t }),
            getTracker: vi.fn().mockImplementation(() => activeTracker || new AggregationTracker()),
            preProcessFusionAccounts: vi.fn().mockResolvedValue([]),
            processIdentity: vi.fn().mockResolvedValue(undefined),
            getFusionIdentity: vi.fn().mockReturnValue(fusionIdentity),
            normalizePendingFormStateForOutput: vi.fn().mockResolvedValue(undefined),
            getISCAccount: vi.fn().mockResolvedValue({ id: 'isc-created' }),
            analyzeUncorrelatedAccounts: vi.fn(),
            forEachISCAccount: vi.fn().mockResolvedValue({ sent: 0, eligible: 0 }),
            refreshUniqueAttributes: vi.fn().mockResolvedValue(0),
            initializeManagedAccountProcessing: vi.fn().mockResolvedValue(undefined),
            processCorrelatedManagedAccounts: vi.fn().mockResolvedValue(undefined),
            processUncorrelatedManagedAccounts: vi.fn().mockResolvedValue({ processed: 0, matchScoringMs: 0 }),
            processManagedAccounts: vi.fn().mockResolvedValue(undefined),
            generateReport: vi.fn(),
        },
        definition: {
            initializeCounters: vi.fn().mockResolvedValue(undefined),
            registerUniqueValuesFromManagedSourceAccounts: vi.fn(),
            refreshUniqueAttributes: vi.fn().mockResolvedValue(undefined),
            saveState: vi.fn().mockResolvedValue(undefined),
        },
        messaging: {
            fetchSender: vi.fn().mockResolvedValue(undefined),
            sendReportTo: vi.fn().mockResolvedValue(undefined),
            renderFusionReportHtml: vi.fn().mockReturnValue('<html></html>'),
            scheduleDelayedAggregation: vi.fn().mockResolvedValue(undefined),
        },
        res: {
            send: vi.fn(),
        },
    } as any
}
