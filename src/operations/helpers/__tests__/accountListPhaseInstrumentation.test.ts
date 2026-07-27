import { FusionRun } from '../../../model/fusionRun'
import { OperationRunContext } from '../../../services/logService/operationRunContext'
import { createOperationTestRegistry } from '../../__tests__/harness/operationTestRegistry'
import { outputPhase, processPhase } from '../accountListPhases'

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


