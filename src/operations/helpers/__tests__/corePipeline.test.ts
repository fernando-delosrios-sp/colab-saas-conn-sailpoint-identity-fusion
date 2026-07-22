import {
    fetchPhase,
    outputPhase,
    refreshPhase,
    processPhase,
    setupPhase,
    PipelineRunner,
} from '../corePipeline'

import { createTestRegistry } from '../../__tests__/harness/testRegistry'
import type { Mock } from 'vitest'

function mockTrackedOperation(log: { metric: Mock }): { done: Mock; elapsedMs: Mock } {
    return {
        done: vi.fn((data?: Record<string, any>) => {
            log.metric('tracked', 0, data)
            return 0
        }),
        elapsedMs: vi.fn(() => 0),
    }
}

function createRegistry() {
    const sourceConfigs = [{ name: 'fusion', correlationMode: 'none', sourceType: 'authoritative' }]
    const registry = createTestRegistry({ sourceConfigs })

    const sources = registry.sources as any
    sources.run = {
        managedAccountsById: new Map(),
        managedAccountsAllById: new Map(),
        managedAccountsByIdentityId: new Map(),
        get managedAccountCount() { return sources.run.managedAccountsById.size },
        get identityCount() { return 0 },
    }
    Object.defineProperty(sources, 'hasFusionSource', { value: true, writable: true, configurable: true })
    Object.defineProperty(sources, 'managedSources', { value: [], writable: true, configurable: true })
    Object.defineProperty(sources, 'fusionAccountCount', { value: 0, writable: true, configurable: true })
    sources.fusionAccountsByNativeIdentity = new Map()
    sources.clearManagedAccounts = vi.fn()
    sources.clearFusionAccounts = vi.fn()
    sources.saveBatchCumulativeCount = vi.fn().mockResolvedValue(undefined)
    sources.aggregateDelayedSources = vi.fn().mockResolvedValue(undefined)
    sources.setProcessLock = vi.fn().mockResolvedValue(undefined)
    sources.releaseProcessLock = vi.fn().mockResolvedValue(undefined)
    sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
    sources.aggregateManagedSources = vi.fn().mockResolvedValue(undefined)
    sources.getSourceByNameSafe = vi.fn()
    sources.clearReverseCorrelationReadinessCache = vi.fn()
    sources.ensureReverseCorrelationSetup = vi.fn().mockResolvedValue(undefined)
    sources.setupReverseCorrelationSources = vi.fn().mockResolvedValue(0)

    const forms = registry.forms as any
    forms.fetchFormInstances = vi.fn().mockResolvedValue(undefined)
    forms.cleanUpForms = vi.fn().mockResolvedValue(undefined)
    forms.awaitPendingDeleteOperations = vi.fn().mockResolvedValue(undefined)
    forms.fetchFormData = vi.fn().mockResolvedValue(undefined)
    forms.processFetchedFormData = vi.fn().mockResolvedValue(undefined)
    forms.deleteExistingForms = vi.fn().mockResolvedValue(undefined)

    const fusion = registry.fusion as any
    fusion.isReset = vi.fn().mockReturnValue(false)
    fusion.disableReset = vi.fn().mockResolvedValue(undefined)
    fusion.resetState = vi.fn().mockResolvedValue(undefined)
    fusion.processFusionAccounts = vi.fn().mockResolvedValue([])
    fusion.processIdentities = vi.fn().mockResolvedValue([])
    fusion.processFusionIdentityDecisions = vi.fn().mockResolvedValue([])
    fusion.awaitPendingDisableOperations = vi.fn().mockResolvedValue(undefined)
    fusion.reconcilePendingFormState = vi.fn()
    fusion.forEachISCAccount = vi.fn().mockResolvedValue({ sent: 0, eligible: 0 })
    fusion.streamAndClearEligibleAccounts = vi.fn().mockResolvedValue({ sent: 0, eligible: 0 })
    fusion.refreshUniqueAttributes = vi.fn().mockResolvedValue(0)

    const schemas = registry.schemas as any
    schemas.loadFusionAccountSchemaFromSource = vi.fn().mockResolvedValue(undefined)
    schemas.setFusionAccountSchema = vi.fn().mockResolvedValue(undefined)
    schemas.getManagedSourceSchemaAttributeNames = vi.fn().mockResolvedValue(new Set<string>())

    const definition = registry.definition as any
    definition.initializeCounters = vi.fn().mockResolvedValue(undefined)
    definition.saveState = vi.fn().mockResolvedValue(undefined)

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
            processFusionAccounts: vi.fn(async () => {
                callOrder.push('processFusionAccounts')
                return []
            }),
            processIdentities: vi.fn(async () => {
                callOrder.push('processIdentities')
                return []
            }),
            processFusionIdentityDecisions: vi.fn(async () => {
                callOrder.push('processFusionIdentityDecisions')
                return []
            }),
            initializeManagedAccountProcessing: vi.fn(async () => {
                callOrder.push('initializeManagedAccountProcessing')
            }),
            processCorrelatedManagedAccounts: vi.fn(async () => {
                callOrder.push('processCorrelatedManagedAccounts')
            }),
            processUncorrelatedManagedAccounts: vi.fn(async () => {
                callOrder.push('processUncorrelatedManagedAccounts')
                return { processed: 0, matchScoringMs: 0 }
            }),
            awaitPendingDisableOperations: vi.fn(async () => {
                callOrder.push('awaitPendingDisableOperations')
            }),
            reconcilePendingFormState: vi.fn(() => {
                callOrder.push('reconcilePendingFormState')
            }),
        }
        const identities = { clear: vi.fn(() => callOrder.push('identities.clear')), identityCount: 0 }
        const sources = { run: { managedAccountsById: new Map() } }
        const log = { info: vi.fn(), metric: vi.fn(), track: vi.fn() }
        const trackedOp = mockTrackedOperation(log)
        log.track.mockReturnValue(trackedOp)
        const registry = { fusion, identities, sources, log } as any

        await refreshPhase(registry, { mode: { kind: 'aggregation' } })
        await processPhase(registry, { mode: { kind: 'aggregation' } })

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
        ])

        expect(log.track).toHaveBeenCalledWith('refreshPhase.processFusionAccounts')
        expect(trackedOp.done).toHaveBeenCalledWith({ count: 0 })
    })
})

describe('corePipeline outputPhase', () => {
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
            fetchIdentities: vi.fn().mockResolvedValue(undefined),
            identityCount: 0,
            getIdentityById: vi.fn(),
        }
        const sources = {
            fetchManagedAccounts: vi.fn().mockResolvedValue(undefined),
            fetchFusionAccounts: vi.fn().mockResolvedValue(undefined),
            run: { managedAccountsById: new Map() },
            managedSources: [],
            getSourceByNameSafe: vi.fn(),
            fusionAccountCount: 0,
            fetchGlobalOwnerIdentityIds: vi.fn().mockResolvedValue([]),
        }
        const fusion = { fusionReportOnAggregation: false, fusionOwnerIsGlobalReviewer: false }
        const messaging = {
            fetchSender: vi.fn().mockResolvedValue(undefined),
            fetchDelayedAggregationSender: vi.fn().mockResolvedValue(undefined),
        }
        const log = { info: vi.fn(), metric: vi.fn(), track: vi.fn(() => ({ done: vi.fn(() => 0), elapsedMs: vi.fn(() => 0) })) }
        const serviceRegistry = { ...registry, forms, identities, sources, fusion, messaging, log }

        await fetchPhase(serviceRegistry, { mode: { kind: 'aggregation' } })
        expect(forms.fetchFormInstances).toHaveBeenCalledWith(true)
        forms.fetchFormInstances.mockClear()
        await fetchPhase(serviceRegistry, { mode: { kind: 'dry-run' } })
        expect(forms.fetchFormInstances).toHaveBeenCalledWith(false)
    })
})

describe('corePipeline setupPhase', () => {
    it('throws error if fusion source is not found', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = false
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = vi.fn().mockReturnValue(false)

        await expect(setupPhase(registry as any, undefined, { mode: { kind: 'aggregation' } })).rejects.toThrow(
            'Fusion source not found'
        )
    })

    it('returns false and disables reset if fusion reset flag is detected during aggregation', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = vi.fn().mockReturnValue(true)
        registry.forms.deleteExistingForms = vi.fn().mockResolvedValue(undefined)
        registry.fusion.disableReset = vi.fn().mockResolvedValue(undefined)
        registry.fusion.resetState = vi.fn().mockResolvedValue(undefined)
        registry.sources.resetBatchCumulativeCount = vi.fn().mockResolvedValue(undefined)

        const result = await setupPhase(registry as any, undefined, { mode: { kind: 'aggregation' } })

        expect(result).toBe(false)
        // setupPhase no longer acquires the process lock — that is hoisted to PipelineRunner.run
        expect(registry.forms.deleteExistingForms).toHaveBeenCalled()
        expect(registry.fusion.disableReset).toHaveBeenCalled()
        expect(registry.fusion.resetState).toHaveBeenCalled()
        expect(registry.sources.resetBatchCumulativeCount).toHaveBeenCalled()
    })

    it('returns false without modifying persistent state if fusion reset flag is detected during dry-run', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = vi.fn().mockReturnValue(true)
        registry.forms.deleteExistingForms = vi.fn().mockResolvedValue(undefined)
        registry.fusion.disableReset = vi.fn().mockResolvedValue(undefined)

        const result = await setupPhase(registry as any, undefined, { mode: { kind: 'dry-run' } })

        expect(result).toBe(false)
        expect(registry.forms.deleteExistingForms).not.toHaveBeenCalled()
        expect(registry.fusion.disableReset).not.toHaveBeenCalled()
    })

    it('disables force attribute refresh flag if enabled in aggregation mode', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = vi.fn().mockReturnValue(false)
        registry.config = { forceAttributeRefresh: true, sources: [] }
        registry.fusion.disableForceAttributeRefresh = vi.fn().mockResolvedValue(undefined)
        registry.schemas.loadFusionAccountSchemaFromSource = vi.fn().mockResolvedValue(undefined)
        registry.sources.aggregateManagedSources = vi.fn().mockResolvedValue(undefined)
        registry.sources.clearReverseCorrelationReadinessCache = vi.fn()
        registry.definition.initializeCounters = vi.fn().mockResolvedValue(undefined)

        const result = await setupPhase(registry as any, undefined, { mode: { kind: 'aggregation' } })

        expect(result).toBe(true)
        expect(registry.fusion.disableForceAttributeRefresh).toHaveBeenCalled()
    })

    it('sets provided schema instead of loading from source if schema is passed', async () => {
        const { registry } = createRegistry()
        registry.sources.hasFusionSource = true
        registry.sources.managedSources = []
        registry.sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = vi.fn().mockReturnValue(false)
        registry.config = { forceAttributeRefresh: false, sources: [] }
        registry.schemas.setFusionAccountSchema = vi.fn().mockResolvedValue(undefined)
        registry.schemas.loadFusionAccountSchemaFromSource = vi.fn().mockResolvedValue(undefined)
        registry.definition.initializeCounters = vi.fn().mockResolvedValue(undefined)

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
        registry.sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(registry.sources, 'managedSources', { get: () => [] })
        registry.fusion.isReset = vi.fn().mockReturnValue(false)

        const reverseSource = { name: 'reverseSrc', correlationMode: 'reverse', correlationAttribute: 'uid' }
        registry.config = { forceAttributeRefresh: false, sources: [reverseSource] }
        registry.schemas.loadFusionAccountSchemaFromSource = vi.fn().mockResolvedValue(undefined)
        registry.sources.clearReverseCorrelationReadinessCache = vi.fn()
        registry.schemas.getManagedSourceSchemaAttributeNames = vi.fn().mockResolvedValue(['uid'])
        registry.sources.ensureReverseCorrelationSetup = vi.fn().mockResolvedValue(undefined)
        registry.schemas.setFusionAccountSchema = vi.fn().mockResolvedValue(undefined)
        registry.sources.setupReverseCorrelationSources = vi.fn().mockResolvedValue(1)
        registry.sources.aggregateManagedSources = vi.fn().mockResolvedValue(undefined)
        registry.definition.initializeCounters = vi.fn().mockResolvedValue(undefined)

        const result = await setupPhase(registry as any, undefined, { mode: { kind: 'aggregation' } })

        expect(result).toBe(true)
        expect(registry.sources.clearReverseCorrelationReadinessCache).toHaveBeenCalled()
        expect(registry.sources.setupReverseCorrelationSources).toHaveBeenCalled()
        // the mock is called twice: once with the normal schema logic, and once after reverse correlation setup
        expect(registry.schemas.setFusionAccountSchema).toHaveBeenCalledWith(undefined)
        expect(registry.sources.aggregateManagedSources).toHaveBeenCalled()
    })
})

describe('PipelineRunner.run', () => {
    let mockServiceRegistry: any
    let mockTimer: any

    beforeEach(() => {
        const setup = createRegistry()
        mockServiceRegistry = setup.registry

        mockTimer = {
            phase: vi.fn(),
            end: vi.fn(),
            totalElapsed: vi.fn().mockReturnValue(100),
            getPhaseBreakdown: vi.fn().mockReturnValue({}),
        }

        mockServiceRegistry.log = {
            timer: vi.fn().mockReturnValue(mockTimer),
            info: vi.fn(),
            crash: vi.fn(),
            track: vi.fn(() => ({
                done: vi.fn(() => 0),
                elapsedMs: vi.fn(() => 0),
            })),
            metric: vi.fn(),
        } as any

        mockServiceRegistry.sources.setProcessLock = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.sources.releaseProcessLock = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.sources.resetBatchCumulativeCount = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.sources.fetchManagedAccounts = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.sources.fetchFusionAccounts = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.sources.fetchGlobalOwnerIdentityIds = vi.fn().mockResolvedValue([])
        mockServiceRegistry.sources.saveBatchCumulativeCount = vi.fn().mockResolvedValue(undefined)

        mockServiceRegistry.fusion.isReset = vi.fn().mockReturnValue(false)
        mockServiceRegistry.fusion.disableReset = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.fusion.resetState = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.fusion.disableForceAttributeRefresh = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.fusion.processFusionAccounts = vi.fn().mockResolvedValue([])
        mockServiceRegistry.fusion.processIdentities = vi.fn().mockResolvedValue([])
        mockServiceRegistry.fusion.processFusionIdentityDecisions = vi.fn().mockResolvedValue([])
        mockServiceRegistry.fusion.initializeManagedAccountProcessing = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.fusion.processCorrelatedManagedAccounts = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.fusion.processUncorrelatedManagedAccounts = vi.fn().mockResolvedValue({ processed: 0, matchScoringMs: 0 })
        mockServiceRegistry.fusion.processManagedAccounts = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.fusion.awaitPendingDisableOperations = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.fusion.reconcilePendingFormState = vi.fn()

        mockServiceRegistry.schemas.loadFusionAccountSchemaFromSource = vi.fn().mockResolvedValue(undefined)

        mockServiceRegistry.forms.deleteExistingForms = vi.fn().mockResolvedValue(undefined)

        mockServiceRegistry.identities.fetchIdentities = vi.fn().mockResolvedValue(undefined)
        mockServiceRegistry.identities.clear = vi.fn()
        Object.defineProperty(mockServiceRegistry.identities, 'identityCount', { value: 0, writable: true, configurable: true })

        mockServiceRegistry.workflows.fetchDelayedAggregationSender = vi.fn().mockResolvedValue(undefined)
    })

    it('runs up to the specified targetPhase', async () => {
        const result = await PipelineRunner.run(mockServiceRegistry, {
            mode: { kind: 'dry-run' },
            targetPhase: 'process',
        })

        expect(result.shouldContinue).toBe(true)
        expect(mockTimer.phase).toHaveBeenCalledTimes(4) // setup, fetch, refresh, process
        expect(mockServiceRegistry.fusion.refreshUniqueAttributes).not.toHaveBeenCalled()
    })

    it('runs all phases up to report by default in persistent aggregation mode', async () => {
        const result = await PipelineRunner.run(mockServiceRegistry, {
            mode: { kind: 'aggregation' },
        })

        expect(result.shouldContinue).toBe(true)
        expect(mockTimer.phase).toHaveBeenCalledTimes(6) // setup, fetch, refresh, process, output, report
        expect(mockServiceRegistry.sources.releaseProcessLock).toHaveBeenCalledTimes(1)
    })

    it('aborts execution early if setupPhase returns shouldContinue = false (reset flag)', async () => {
        mockServiceRegistry.fusion.isReset.mockReturnValue(true)

        const result = await PipelineRunner.run(mockServiceRegistry, {
            mode: { kind: 'aggregation' },
        })

        expect(result.shouldContinue).toBe(false)
        expect(mockTimer.phase).not.toHaveBeenCalled()
        expect(mockServiceRegistry.sources.releaseProcessLock).toHaveBeenCalled()
    })

    it('keeps fusion accounts alive until the report phase has read fusionAccountCount', async () => {
        const callOrder: string[] = []
        const seenCounts: number[] = []
        const fusionMap = new Map<string, unknown>([['a', {}], ['b', {}], ['c', {}]])
        Object.defineProperty(mockServiceRegistry.sources, 'fusionAccountsByNativeIdentity', {
            configurable: true,
            get: () => fusionMap,
        })
        mockServiceRegistry.sources.fusionAccountCount = fusionMap.size
        mockServiceRegistry.sources.clearFusionAccounts = vi.fn(() => {
            callOrder.push('clearFusionAccounts')
            fusionMap.clear()
        })
        mockServiceRegistry.fusion.fusionReportOnAggregation = true
        mockServiceRegistry.reports = {
            generateAndSendFusionReport: vi.fn(async () => {
                callOrder.push('reportPhase')
                seenCounts.push(mockServiceRegistry.sources.fusionAccountCount)
            }),
        }

        await PipelineRunner.run(mockServiceRegistry, {
            mode: { kind: 'aggregation' },
        })

        expect(seenCounts).toEqual([3])
        expect(callOrder).toEqual(['reportPhase', 'clearFusionAccounts'])
        expect(mockServiceRegistry.sources.clearFusionAccounts).toHaveBeenCalledTimes(1)
    })
})

