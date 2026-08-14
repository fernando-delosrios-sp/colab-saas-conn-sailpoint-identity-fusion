import { createOperationTestRegistry } from '../../__tests__/harness/operationTestRegistry'
import { AggregationTracker } from '../../../services/fusionService'
import { buildReportContext, runAccountListPhases } from '../accountListOrchestration'

describe('accountListOrchestration — runAccountListPhases', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('stops after setup when reset accounts flag is set', async () => {
        const registry = createOperationTestRegistry()
        const fusion = registry.fusion as any
        fusion.isResetAccounts = vi.fn().mockReturnValue(true)

        const result = await runAccountListPhases(
            registry,
            { isPersistent: false },
            { log: registry.log, timer: registry.log.timer(), logPhases: false }
        )

        expect(result.continued).toBe(false)
        expect(registry.sources.fetchManagedAccounts).not.toHaveBeenCalled()
    })

    it('records phase timing when logPhases is false', async () => {
        const registry = createOperationTestRegistry()
        const timer = registry.log.timer()

        const result = await runAccountListPhases(
            registry,
            { isPersistent: false, throughPhase: 4 },
            { log: registry.log, timer, logPhases: false }
        )

        expect(result.continued).toBe(true)
        expect(result.fetchResult).toBeDefined()
        const breakdown = timer.getPhaseBreakdown()
        expect(breakdown.some((entry) => entry.phase === 'Setup')).toBe(true)
        expect(breakdown.some((entry) => entry.phase === 'Process')).toBe(true)
        expect(breakdown.some((entry) => entry.phase === 'Output')).toBe(false)
    })
})

describe('accountListOrchestration — buildReportContext', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('sets AggregationTracker on FusionRun for report generation', async () => {
        const registry = createOperationTestRegistry()
        const fusion = registry.fusion as any

        await buildReportContext(registry)

        expect(fusion.setTracker).toHaveBeenCalledTimes(1)
        expect(fusion.setTracker.mock.calls[0][0]).toBeInstanceOf(AggregationTracker)
    })
})
