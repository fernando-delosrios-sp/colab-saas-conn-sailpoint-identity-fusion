import {
    fetchPhase,
    outputPhase,
    outputPreparationPhase,
    refreshPhase,
    processPhase,
    setupPhase,
    uniqueAttributesPhase,
} from '../corePipeline'

import { createRegistry as createMockRegistry } from '../../__tests__/harness/registryMocking'

function mockTrackedOperation(log: { metric: jest.Mock }): { done: jest.Mock; elapsedMs: jest.Mock } {
    return {
        done: jest.fn((data?: Record<string, any>) => {
            log.metric('tracked', 0, data)
            return 0
        }),
        elapsedMs: jest.fn(() => 0),
    }
}

function createRegistry() {
    const registry = createMockRegistry()
    registry.sources.managedAccountsById = new Map()
    registry.sources.managedSources = []
    registry.sources.clearManagedAccounts = jest.fn()
    registry.sources.saveBatchCumulativeCount = jest.fn().mockResolvedValue(undefined)
    registry.sources.clearFusionAccounts = jest.fn()
    registry.sources.aggregateDelayedSources = jest.fn().mockResolvedValue(undefined)
    return {
        registry,
        forms: registry.forms,
        fusion: registry.fusion,
        sources: registry.sources,
    }
}

describe('corePipeline phase split', () => {
    it('runs refresh before process before unique attributes with correct side-effect order', async () => {
        const callOrder: string[] = []
        const fusion = {
            processFusionAccounts: jest.fn(async () => {
                callOrder.push('processFusionAccounts')
                return []
            }),
            processIdentities: jest.fn(async () => {
                callOrder.push('processIdentities')
                return []
            }),
            processFusionIdentityDecisions: jest.fn(async () => {
                callOrder.push('processFusionIdentityDecisions')
                return []
            }),
            initializeManagedAccountProcessing: jest.fn(async () => {
                callOrder.push('initializeManagedAccountProcessing')
            }),
            processCorrelatedManagedAccounts: jest.fn(async () => {
                callOrder.push('processCorrelatedManagedAccounts')
            }),
            processUncorrelatedManagedAccounts: jest.fn(async () => {
                callOrder.push('processUncorrelatedManagedAccounts')
                return { processed: 0, matchScoringMs: 0 }
            }),
            awaitPendingDisableOperations: jest.fn(async () => {
                callOrder.push('awaitPendingDisableOperations')
            }),
            reconcilePendingFormState: jest.fn(() => {
                callOrder.push('reconcilePendingFormState')
            }),
            refreshUniqueAttributes: jest.fn(async () => {
                callOrder.push('refreshUniqueAttributes')
                return 0
            }),
        }
        const identities = { clear: jest.fn(() => callOrder.push('identities.clear')), identityCount: 0 }
        const sources = { managedAccountsById: new Map() }
        const log = { info: jest.fn(), metric: jest.fn(), track: jest.fn() }
        const trackedOp = mockTrackedOperation(log)
        log.track.mockReturnValue(trackedOp)
        const registry = { fusion, identities, sources, log } as any

        await refreshPhase(registry, { mode: { kind: 'aggregation' } })
        await processPhase(registry, { mode: { kind: 'aggregation' } })
        await uniqueAttributesPhase(registry, { mode: { kind: 'aggregation' } })

        expect(callOrder).toEqual([
            'processFusionAccounts',
            'processIdentities',
            'processFusionIdentityDecisions',
            'identities.clear',
            'initializeManagedAccountProcessing',
            'processCorrelatedManagedAccounts',
            'processUncorrelatedManagedAccounts',
            'awaitPendingDisableOperations',
            'reconcilePendingFormState',
            'refreshUniqueAttributes',
        ])

        expect(log.track).toHaveBeenCalledWith('refreshPhase.processFusionAccounts')
        expect(trackedOp.done).toHaveBeenCalledWith({ count: 0 })
    })
})

describe('corePipeline outputPhase', () => {
    it('delegates output preparation to unique attributes phase', async () => {
        const { registry, fusion } = createRegistry()

        await outputPreparationPhase(registry, { mode: { kind: 'dry-run' } })

        expect(fusion.refreshUniqueAttributes).toHaveBeenCalledTimes(1)
    })

    it('drains queued form deletions before persistent pipeline exit', async () => {
        const { registry, forms } = createRegistry()

        await outputPhase(registry, { mode: { kind: 'aggregation' } })

        expect(forms.cleanUpForms).toHaveBeenCalledTimes(1)
        expect(forms.awaitPendingDeleteOperations).toHaveBeenCalledTimes(1)
        expect(forms.cleanUpForms.mock.invocationCallOrder[0]).toBeLessThan(
            forms.awaitPendingDeleteOperations.mock.invocationCallOrder[0]
        )
    })

    it('skips form cleanup for non-persistent mode', async () => {
        const { registry, forms, fusion } = createRegistry()
        fusion.forEachISCAccount.mockResolvedValue({ sent: 0, eligible: 0 })

        await outputPhase(registry, { mode: { kind: 'dry-run' } })

        expect(forms.cleanUpForms).not.toHaveBeenCalled()
        expect(forms.awaitPendingDeleteOperations).not.toHaveBeenCalled()
    })

    it('passes stale cleanup flag only for persistent fetch runs', async () => {
        const { registry, forms } = createRegistry()
        const identities = {
            fetchIdentities: jest.fn().mockResolvedValue(undefined),
            identityCount: 0,
            getIdentityById: jest.fn(),
        }
        const sources = {
            fetchManagedAccounts: jest.fn().mockResolvedValue(undefined),
            fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
            managedAccountsById: new Map(),
            managedSources: [],
            getSourceByNameSafe: jest.fn(),
            fusionAccountCount: 0,
            fetchGlobalOwnerIdentityIds: jest.fn().mockResolvedValue([]),
        }
        const fusion = { fusionReportOnAggregation: false, fusionOwnerIsGlobalReviewer: false }
        const messaging = {
            fetchSender: jest.fn().mockResolvedValue(undefined),
            fetchDelayedAggregationSender: jest.fn().mockResolvedValue(undefined),
        }
        const log = { info: jest.fn(), metric: jest.fn(), track: jest.fn(() => ({ done: jest.fn(() => 0), elapsedMs: jest.fn(() => 0) })) }
        const serviceRegistry = { ...registry, forms, identities, sources, fusion, messaging, log }

        await fetchPhase(serviceRegistry, { mode: { kind: 'aggregation' } })
        expect(forms.fetchFormInstancesData).toHaveBeenCalledWith(true)

        forms.fetchFormInstancesData.mockClear()
        await fetchPhase(serviceRegistry, { mode: { kind: 'dry-run' } })
        expect(forms.fetchFormInstancesData).toHaveBeenCalledWith(false)
    })
})

describe('corePipeline setupPhase', () => {
    it('throws error if fusion source is not found', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = false
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = jest.fn().mockReturnValue(false)

        await expect(setupPhase(registry as any, undefined, { mode: { kind: 'aggregation' } })).rejects.toThrow(
            'Fusion source not found'
        )
    })

    it('returns false and disables reset if fusion reset flag is detected during aggregation', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.sources.setProcessLock = jest.fn().mockResolvedValue(undefined)
        registry.fusion.isReset = jest.fn().mockReturnValue(true)
        registry.forms.deleteExistingForms = jest.fn().mockResolvedValue(undefined)
        registry.fusion.disableReset = jest.fn().mockResolvedValue(undefined)
        registry.fusion.resetState = jest.fn().mockResolvedValue(undefined)
        registry.sources.resetBatchCumulativeCount = jest.fn().mockResolvedValue(undefined)

        const result = await setupPhase(registry as any, undefined, { mode: { kind: 'aggregation' } })

        expect(result).toBe(false)
        expect(registry.sources.setProcessLock).toHaveBeenCalled()
        expect(registry.forms.deleteExistingForms).toHaveBeenCalled()
        expect(registry.fusion.disableReset).toHaveBeenCalled()
        expect(registry.fusion.resetState).toHaveBeenCalled()
        expect(registry.sources.resetBatchCumulativeCount).toHaveBeenCalled()
    })

    it('returns false without modifying persistent state if fusion reset flag is detected during dry-run', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = jest.fn().mockReturnValue(true)
        registry.forms.deleteExistingForms = jest.fn().mockResolvedValue(undefined)
        registry.fusion.disableReset = jest.fn().mockResolvedValue(undefined)

        const result = await setupPhase(registry as any, undefined, { mode: { kind: 'dry-run' } })

        expect(result).toBe(false)
        expect(registry.forms.deleteExistingForms).not.toHaveBeenCalled()
        expect(registry.fusion.disableReset).not.toHaveBeenCalled()
    })

    it('disables force attribute refresh flag if enabled in aggregation mode', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.sources.setProcessLock = jest.fn().mockResolvedValue(undefined)
        registry.fusion.isReset = jest.fn().mockReturnValue(false)
        registry.config = { forceAttributeRefresh: true, sources: [] }
        registry.fusion.disableForceAttributeRefresh = jest.fn().mockResolvedValue(undefined)
        registry.schemas.loadFusionAccountSchemaFromSource = jest.fn().mockResolvedValue(undefined)
        registry.sources.aggregateManagedSources = jest.fn().mockResolvedValue(undefined)
        registry.sources.clearReverseCorrelationReadinessCache = jest.fn()
        registry.attributes.initializeCounters = jest.fn().mockResolvedValue(undefined)

        const result = await setupPhase(registry as any, undefined, { mode: { kind: 'aggregation' } })

        expect(result).toBe(true)
        expect(registry.fusion.disableForceAttributeRefresh).toHaveBeenCalled()
    })

    it('sets provided schema instead of loading from source if schema is passed', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = jest.fn().mockReturnValue(false)
        registry.config = { forceAttributeRefresh: false, sources: [] }
        registry.schemas.setFusionAccountSchema = jest.fn().mockResolvedValue(undefined)
        registry.schemas.loadFusionAccountSchemaFromSource = jest.fn().mockResolvedValue(undefined)
        registry.attributes.initializeCounters = jest.fn().mockResolvedValue(undefined)

        const dummySchema = { attributes: [] }
        const result = await setupPhase(registry as any, dummySchema, { mode: { kind: 'dry-run' } })

        expect(result).toBe(true)
        expect(registry.schemas.setFusionAccountSchema).toHaveBeenCalledWith(dummySchema)
        expect(registry.schemas.loadFusionAccountSchemaFromSource).not.toHaveBeenCalled()
    })

    it('handles reverse correlation sources in aggregation mode', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.sources.setProcessLock = jest.fn().mockResolvedValue(undefined)
        registry.fusion.isReset = jest.fn().mockReturnValue(false)

        const reverseSource = { name: 'reverseSrc', correlationMode: 'reverse', correlationAttribute: 'uid' }
        registry.config = { forceAttributeRefresh: false, sources: [reverseSource] }
        registry.schemas.loadFusionAccountSchemaFromSource = jest.fn().mockResolvedValue(undefined)
        registry.sources.clearReverseCorrelationReadinessCache = jest.fn()
        registry.schemas.getManagedSourceSchemaAttributeNames = jest.fn().mockResolvedValue(['uid'])
        registry.sources.ensureReverseCorrelationSetup = jest.fn().mockResolvedValue(undefined)
        registry.schemas.setFusionAccountSchema = jest.fn().mockResolvedValue(undefined)
        registry.sources.setupReverseCorrelationSources = jest.fn().mockResolvedValue(1)
        registry.sources.aggregateManagedSources = jest.fn().mockResolvedValue(undefined)
        registry.attributes.initializeCounters = jest.fn().mockResolvedValue(undefined)

        const result = await setupPhase(registry as any, undefined, { mode: { kind: 'aggregation' } })

        expect(result).toBe(true)
        expect(registry.sources.clearReverseCorrelationReadinessCache).toHaveBeenCalled()
        expect(registry.sources.setupReverseCorrelationSources).toHaveBeenCalled()
        // the mock is called twice: once with the normal schema logic, and once after reverse correlation setup
        expect(registry.schemas.setFusionAccountSchema).toHaveBeenCalledWith(undefined)
        expect(registry.sources.aggregateManagedSources).toHaveBeenCalled()
    })
})
