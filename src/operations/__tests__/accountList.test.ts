import { accountList } from '../accountList'
import { ServiceRegistry } from '../../services/serviceRegistry'

type SourceConfigLike = {
    name: string
    correlationMode: 'none' | 'correlate' | 'reverse'
    correlationAttribute?: string
    correlationDisplayName?: string
}

function createMockRegistry(sourceConfigs: SourceConfigLike[]) {
    const timer = {
        phase: jest.fn(),
        end: jest.fn(),
        totalElapsed: jest.fn(() => 0),
    }

    const schemas = {
        setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
        getManagedSourceSchemaAttributeNames: jest.fn().mockResolvedValue(new Set<string>()),
    }

    const sources = {
        fetchAllSources: jest.fn().mockResolvedValue(undefined),
        setProcessLock: jest.fn().mockResolvedValue(undefined),
        releaseProcessLock: jest.fn().mockResolvedValue(undefined),
        resetBatchCumulativeCount: jest.fn().mockResolvedValue(undefined),
        ensureReverseCorrelationSetup: jest.fn().mockResolvedValue(undefined),
        aggregateManagedSources: jest.fn().mockResolvedValue(undefined),
        aggregateDelayedSources: jest.fn().mockResolvedValue(undefined),
        fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
        fetchManagedAccounts: jest.fn().mockResolvedValue(undefined),
        saveBatchCumulativeCount: jest.fn().mockResolvedValue(undefined),
        clearManagedAccounts: jest.fn(),
        clearFusionAccounts: jest.fn(),
        getSourceByName: jest.fn(),
        managedSources: [],
        managedAccountsById: new Map(),
        fusionAccountCount: 0,
        fusionSourceOwner: { id: 'fusion-owner' },
    }

    const identities = {
        fetchIdentities: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn(),
        getIdentityById: jest.fn(),
        fetchIdentityById: jest.fn().mockResolvedValue(undefined),
    }

    const forms = {
        deleteExistingForms: jest.fn().mockResolvedValue(undefined),
        fetchFormData: jest.fn().mockResolvedValue(undefined),
        cleanUpForms: jest.fn().mockResolvedValue(undefined),
    }

    const fusion = {
        isReset: jest.fn(() => false),
        disableReset: jest.fn().mockResolvedValue(undefined),
        resetState: jest.fn().mockResolvedValue(undefined),
        processFusionAccounts: jest.fn().mockResolvedValue(undefined),
        processIdentities: jest.fn().mockResolvedValue(undefined),
        processFusionIdentityDecisions: jest.fn().mockResolvedValue(undefined),
        processManagedAccounts: jest.fn().mockResolvedValue(undefined),
        refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
        reconcilePendingFormState: jest.fn(),
        clearAnalyzedAccounts: jest.fn(),
        forEachISCAccount: jest.fn().mockResolvedValue(0),
        fusionReportOnAggregation: false,
    }

    const messaging = {
        fetchSender: jest.fn().mockResolvedValue(undefined),
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
        schemas,
        sources,
        identities,
        forms,
        fusion,
        messaging,
        attributes,
    } as any

    return { registry, schemas, sources }
}

describe('accountList setup phase', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('refreshes schema after reverse-correlation setup so new attributes are retained', async () => {
        const reverseSource = {
            name: 'HR Source',
            correlationMode: 'reverse' as const,
            correlationAttribute: 'hrNativeIdentity',
            correlationDisplayName: 'HR Native Identity',
        }
        const { registry, schemas, sources } = createMockRegistry([reverseSource])
        const input = { schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledTimes(1)
        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledWith(reverseSource, expect.any(Set))
        expect(schemas.setFusionAccountSchema).toHaveBeenNthCalledWith(1, input.schema)
        expect(schemas.setFusionAccountSchema).toHaveBeenNthCalledWith(2, undefined)
    })

    it('does not reload schema when no reverse-correlation source is configured', async () => {
        const correlateSource = {
            name: 'IT Source',
            correlationMode: 'correlate' as const,
        }
        const { registry, schemas, sources } = createMockRegistry([correlateSource])
        const input = { schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(sources.ensureReverseCorrelationSetup).not.toHaveBeenCalled()
        expect(schemas.setFusionAccountSchema).toHaveBeenCalledTimes(1)
        expect(schemas.setFusionAccountSchema).toHaveBeenCalledWith(input.schema)
    })

    it('runs reverse-correlation setup sequentially across multiple sources', async () => {
        const reverseSources = [
            {
                name: 'Source A',
                correlationMode: 'reverse' as const,
                correlationAttribute: 'attrA',
                correlationDisplayName: 'Attr A',
            },
            {
                name: 'Source B',
                correlationMode: 'reverse' as const,
                correlationAttribute: 'attrB',
                correlationDisplayName: 'Attr B',
            },
        ]
        const { registry, sources } = createMockRegistry(reverseSources)
        const input = { schema: { attributes: [] } } as any

        let inFlight = 0
        let maxInFlight = 0
        sources.ensureReverseCorrelationSetup.mockImplementation(async () => {
            inFlight++
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 5))
            inFlight--
        })

        await accountList(registry, input)

        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledTimes(2)
        expect(maxInFlight).toBe(1)
    })
})
