import { AggregationTracker } from '../../../services/fusionService/aggregationTracker'

export function createRegistry() {
    const timer = {
        phase: jest.fn(),
        end: jest.fn(),
        totalElapsed: jest.fn(() => 0),
        getPhaseBreakdown: jest.fn(),
        recordElapsed: jest.fn(),
    }

    const fusionIdentity = {
        managedKey: 'fusion-id-1',
        addStatus: jest.fn(),
    }

    const trackedOp = {
            done: jest.fn(() => 0),
            elapsedMs: jest.fn(() => 0),
        }
    let activeTracker: any = null
    return {
        config: {
            sources: [],
        },
        log: {
            info: jest.fn(),
            debug: jest.fn(),
            crash: jest.fn(),
            timer: jest.fn(() => timer),
            metric: jest.fn(),
            track: jest.fn(() => trackedOp),
        },
        identities: {
            fetchIdentityByName: jest.fn().mockResolvedValue({ id: 'id-1', name: 'Alice Doe' }),
        },
        sources: {
            fetchAllSources: jest.fn().mockResolvedValue(undefined),
            fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
            fetchFusionAccount: jest.fn().mockResolvedValue(undefined),
            fusionAccounts: [{ id: 'fusion-existing-1' }],
            fusionAccountsByNativeIdentity: new Map(),
            hasFusionSource: true,
            clearReverseCorrelationReadinessCache: jest.fn(),
            setupReverseCorrelationSources: jest.fn().mockImplementation((_schemaAttrNames: Set<string>) => Promise.resolve(0)),
            aggregateManagedSources: jest.fn().mockResolvedValue(undefined),
        },
        schemas: {
            setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
            getManagedSourceSchemaAttributeNames: jest.fn().mockResolvedValue(new Set<string>()),
            fusionDisplayAttribute: 'name',
        },
        forms: {
            fetchFormData: jest.fn().mockResolvedValue(undefined),
            fetchFormInstances: jest.fn().mockResolvedValue(undefined),
            processFetchedFormData: jest.fn().mockResolvedValue(undefined),
            cleanUpForms: jest.fn().mockResolvedValue(undefined),
            awaitPendingDeleteOperations: jest.fn().mockResolvedValue(undefined),
            fusionIdentityDecisions: [],
        },
        fusion: {
            setTracker: jest.fn().mockImplementation((t) => { activeTracker = t }),
            getTracker: jest.fn().mockImplementation(() => activeTracker || new AggregationTracker()),
            preProcessFusionAccounts: jest.fn().mockResolvedValue([]),
            processIdentity: jest.fn().mockResolvedValue(undefined),
            getFusionIdentity: jest.fn().mockReturnValue(fusionIdentity),
            normalizePendingFormStateForOutput: jest.fn().mockResolvedValue(undefined),
            getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-created' }),
            analyzeUncorrelatedAccounts: jest.fn(),
            forEachISCAccount: jest.fn().mockResolvedValue({ sent: 0, eligible: 0 }),
            refreshUniqueAttributes: jest.fn().mockResolvedValue(0),
            initializeManagedAccountProcessing: jest.fn().mockResolvedValue(undefined),
            processCorrelatedManagedAccounts: jest.fn().mockResolvedValue(undefined),
            processUncorrelatedManagedAccounts: jest.fn().mockResolvedValue({ processed: 0, matchScoringMs: 0 }),
            processManagedAccounts: jest.fn().mockResolvedValue(undefined),
            generateReport: jest.fn(),
        },
        attributes: {
            initializeCounters: jest.fn().mockResolvedValue(undefined),
            registerUniqueValuesFromRawAccounts: jest.fn(),
            refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
            saveState: jest.fn().mockResolvedValue(undefined),
        },
        messaging: {
            fetchSender: jest.fn().mockResolvedValue(undefined),
            sendReportTo: jest.fn().mockResolvedValue(undefined),
            renderFusionReportHtml: jest.fn().mockReturnValue('<html></html>'),
            scheduleDelayedAggregation: jest.fn().mockResolvedValue(undefined),
        },
        res: {
            send: jest.fn(),
        },
    } as any
}
