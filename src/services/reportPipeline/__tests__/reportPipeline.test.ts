import { runReportPipeline } from '../index'
import { createOperationTestRegistry } from '../../../operations/__tests__/harness/operationTestRegistry'

describe('runReportPipeline', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('activates dry-run, skips Output streaming, and delivers a Fusion report', async () => {
        const registry = createOperationTestRegistry()
        const activateSpy = vi.spyOn(registry, 'activateDryRunMode')
        const forEachSpy = vi.spyOn(registry.fusion, 'forEachISCAccount')

        await runReportPipeline(registry, false)

        expect(activateSpy).toHaveBeenCalledTimes(1)
        expect(registry.run.isDryRunMode).toBe(true)
        expect(forEachSpy).not.toHaveBeenCalled()
        expect(registry.res.send).not.toHaveBeenCalled()
        expect(registry.reports.generateAndSendFusionReport).toHaveBeenCalledWith(
            false,
            expect.anything(),
            'fusion'
        )
    })
})
