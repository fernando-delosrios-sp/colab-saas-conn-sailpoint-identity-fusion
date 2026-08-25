import { FusionRun } from '../../../model/fusionRun'
import { OperationRunContext } from '../../../services/logService/operationRunContext'
import { createOperationTestRegistry } from '../../__tests__/harness/operationTestRegistry'
import { outputPhase, processPhase, fetchPhase, refreshPhase } from '../accountListPhases'

describe('accountListPhases step instrumentation', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    function createRegistry(options: { recordMode?: boolean } = {}) {
        const registry = createOperationTestRegistry()
        const fusion = registry.fusion as any
        const identities = registry.identities as any

        if (options.recordMode) {
            const recordRun = new FusionRun(undefined, { recording: { mode: 'record' } } as any)
            registry.sources.run = recordRun
            fusion.run = recordRun
        }

        fusion.processRecordUniqueRegistration = vi.fn().mockResolvedValue({ registered: 0 })
        identities.hydrateMissingIdentitiesById = vi.fn().mockResolvedValue(undefined)
        registry.run.managedAccountsById.set('acct-1', { id: 'acct-1', sourceName: 'HR' } as any)

        return registry
    }

    function stepStartOrder(log: { stepStart: (...args: unknown[]) => void }): string[] {
        return vi.mocked(log.stepStart).mock.calls.map(([step]) => String(step))
    }

    it('processPhase logs managed-account-init before orphan-identity-hydration', async () => {
        const registry = createRegistry()
        const log = registry.log
        const fusion = registry.fusion as any
        vi.spyOn(log, 'stepStart')
        vi.spyOn(log, 'stepEnd')

        await processPhase(registry, { isPersistent: false })

        expect(fusion.initializeManagedAccountProcessing).toHaveBeenCalled()
        const order = stepStartOrder(log)
        expect(order.indexOf('managed-account-init')).toBeGreaterThan(order.indexOf('process-decisions'))
        expect(order.indexOf('orphan-identity-hydration')).toBeGreaterThan(order.indexOf('managed-account-init'))
        expect(log.stepEnd).toHaveBeenCalledWith('managed-account-init', { remaining: 1 })
    })

    it('processPhase tracks initializeManagedAccountProcessing as METRIC inside managed-account-init', async () => {
        const registry = createRegistry()
        const log = registry.log
        vi.spyOn(log, 'track')

        await processPhase(registry, { isPersistent: false })

        expect(log.track).toHaveBeenCalledWith('FusionService.initializeManagedAccountProcessing')
    })

    it('processPhase logs form-reconcile with forms-created and instances-sent', async () => {
        const registry = createRegistry()
        const log = registry.log
        const forms = registry.forms as any
        vi.spyOn(log, 'stepEnd')
        Object.defineProperty(forms, 'formsCreated', { value: 12, configurable: true })
        Object.defineProperty(forms, 'formInstancesCreated', { value: 36, configurable: true })

        await processPhase(registry, { isPersistent: false })

        expect(log.stepEnd).toHaveBeenCalledWith('form-reconcile', {
            'forms-created': 12,
            'instances-sent': 36,
        })
    })

    it('processPhase completion DETAIL includes correlation segment when activity recorded', async () => {
        const registry = createRegistry()
        const log = registry.log
        log.bindRunContext(new OperationRunContext())
        vi.spyOn(log, 'detail')
        log.recordCorrelationActivity({ kind: 'merge', accounts: 2 })

        await processPhase(registry, { isPersistent: false })

        expect(log.detail).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'process phase complete',
                correlations: 'merge=1/2',
            })
        )
    })

    it('outputPhase logs clear-managed-accounts before form-cleanup when not in record mode', async () => {
        const registry = createRegistry()
        const log = registry.log
        const sources = registry.sources as any
        vi.spyOn(log, 'stepStart')
        vi.spyOn(log, 'stepEnd')

        await outputPhase(registry, { isPersistent: true })

        expect(sources.clearManagedAccounts).toHaveBeenCalled()
        const order = stepStartOrder(log)
        expect(order.indexOf('clear-managed-accounts')).toBeGreaterThanOrEqual(0)
        expect(order.indexOf('form-cleanup')).toBeGreaterThan(order.indexOf('clear-managed-accounts'))
        expect(log.stepStart).toHaveBeenCalledWith('clear-managed-accounts', { accounts: 1 })
        expect(log.stepEnd).toHaveBeenCalledWith('clear-managed-accounts', { cleared: 1 })
    })

    it('outputPhase omits clear-managed-accounts step in record mode', async () => {
        const registry = createRegistry({ recordMode: true })
        const log = registry.log
        const sources = registry.sources as any
        vi.spyOn(log, 'stepStart')

        await outputPhase(registry, { isPersistent: false })

        expect(sources.clearManagedAccounts).not.toHaveBeenCalled()
        expect(stepStartOrder(log)).not.toContain('clear-managed-accounts')
    })
})

describe('fetchPhase global reviewer hydration', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('includes fusion source owners during dry-run when global reviewer is enabled', async () => {
        const registry = createOperationTestRegistry()
        const { identities, sources, fusion } = registry
        const globalOwnerIds = ['global-owner-1']

        ;(fusion as any).fusionOwnerIsGlobalReviewer = true
        ;(fusion as any).fusionReportOnAggregation = false
        ;(sources as any).fetchGlobalOwnerIdentityIds = vi.fn().mockResolvedValue(globalOwnerIds)

        await fetchPhase(registry, { isPersistent: false })

        expect((sources as any).fetchGlobalOwnerIdentityIds).toHaveBeenCalledTimes(1)
        expect(identities.fetchIdentities).toHaveBeenCalledWith(globalOwnerIds)
    })

    it('skips owner hydration during dry-run when global reviewer is disabled', async () => {
        const registry = createOperationTestRegistry()
        const { identities, sources, fusion } = registry

        ;(fusion as any).fusionOwnerIsGlobalReviewer = false
        ;(fusion as any).fusionReportOnAggregation = true
        ;(sources as any).fetchGlobalOwnerIdentityIds = vi.fn().mockResolvedValue(['owner-1'])

        await fetchPhase(registry, { isPersistent: false })

        expect((sources as any).fetchGlobalOwnerIdentityIds).not.toHaveBeenCalled()
        expect(identities.fetchIdentities).toHaveBeenCalledWith([])
    })
})

describe('refreshPhase workload summary', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('emits DETAIL refresh workload with bucket millisecond keys when Fusion accounts were processed', async () => {
        const registry = createOperationTestRegistry()
        const log = registry.log
        const fusion = registry.fusion as any
        log.bindRunContext(new OperationRunContext())
        log.phaseStart(3, 'Refresh')
        fusion.ensureGlobalReviewerOwnersInScope = vi.fn().mockResolvedValue(undefined)
        fusion.processFusionAccounts = vi.fn().mockImplementation(async () => {
            const ctx = log.getRunContext()
            ctx?.recordRefreshSubStep('prelude', 1)
            ctx?.recordRefreshSubStep('managedLayer', 2)
            ctx?.recordRefreshSubStep('map', 3)
            ctx?.recordRefreshSubStep('normalDefine', 4)
            ctx?.incrementRefreshAccountsProcessed()
            return [{ id: 'fa-1' }]
        })
        vi.spyOn(log, 'detail')
        vi.spyOn(log, 'track')

        await refreshPhase(registry)

        expect(log.track).toHaveBeenCalledWith('refreshPhase.processFusionAccounts')
        expect(vi.mocked(log.track).mock.calls.map(([name]) => name)).toEqual([
            'refreshPhase.processFusionAccounts',
        ])
        expect(log.detail).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'refresh workload',
                accounts: 1,
                preludeMs: 1,
                managedLayerMs: 2,
                mapMs: 3,
                normalDefineMs: 4,
            })
        )
        const workloadCalls = vi.mocked(log.detail).mock.calls.filter(([payload]) => payload.action === 'refresh workload')
        expect(workloadCalls).toHaveLength(1)
    })

    it('skips refresh workload DETAIL when Refresh processes zero Fusion accounts', async () => {
        const registry = createOperationTestRegistry()
        const log = registry.log
        const fusion = registry.fusion as any
        log.bindRunContext(new OperationRunContext())
        log.phaseStart(3, 'Refresh')
        fusion.ensureGlobalReviewerOwnersInScope = vi.fn().mockResolvedValue(undefined)
        fusion.processFusionAccounts = vi.fn().mockResolvedValue([])
        vi.spyOn(log, 'detail')

        await refreshPhase(registry)

        expect(log.detail).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'refresh workload' }))
    })
})


