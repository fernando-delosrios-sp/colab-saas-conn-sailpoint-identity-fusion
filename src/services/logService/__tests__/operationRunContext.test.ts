import { LogService } from '../logService'
import {
    OperationRunContext,
    createEmptyEventCounters,
    createEmptyCorrelationActivityCounters,
} from '../operationRunContext'

const mockLogger = vi.hoisted(() => ({
    level: 'info',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}))

vi.mock('@sailpoint/connector-sdk', () => ({
    logger: mockLogger,
    ConnectorError: class extends Error {},
    ConnectorErrorType: { Generic: 'Generic' },
}))

describe('OperationRunContext', () => {
    it('records match events by type', () => {
        const ctx = new OperationRunContext()
        ctx.recordEvent('match', { type: 'exact' })
        ctx.recordEvent('match', { type: 'partial' })
        ctx.recordEvent('match', { type: 'deferred' })

        const flushed = ctx.flushEventCounters()
        expect(flushed.matchExact).toBe(1)
        expect(flushed.matchPartial).toBe(1)
        expect(flushed.matchDeferred).toBe(1)
        expect(ctx.getCumulativeOutcomes().deferred).toBe(1)
        expect(ctx.peekEventCounters()).toEqual(createEmptyEventCounters())
    })

    it('records link correlation activity via recordEvent legacy path', () => {
        const ctx = new OperationRunContext()
        ctx.recordEvent('correlation', { accounts: 3 })
        ctx.recordEvent('correlation', { accounts: 2 })

        const flushed = ctx.flushEventCounters()
        expect(flushed.correlation.linkTriggers).toBe(2)
        expect(flushed.correlation.linkAccounts).toBe(5)
    })

    it('records link and merge correlation activity separately', () => {
        const ctx = new OperationRunContext()
        ctx.recordCorrelationActivity({ kind: 'link', accounts: 3 })
        ctx.recordCorrelationActivity({ kind: 'merge', accounts: 1 })

        const flushed = ctx.flushEventCounters()
        expect(flushed.correlation.linkTriggers).toBe(1)
        expect(flushed.correlation.linkAccounts).toBe(3)
        expect(flushed.correlation.mergeTriggers).toBe(1)
        expect(flushed.correlation.mergeAccounts).toBe(1)
    })

    it('tracks correlation completed counts in interval and phase counters', () => {
        const ctx = new OperationRunContext()
        ctx.recordCorrelationCompleted({ kind: 'link' })
        ctx.recordCorrelationCompleted({ kind: 'merge', count: 2 })

        const flushed = ctx.flushEventCounters()
        expect(flushed.correlation.linkCompleted).toBe(1)
        expect(flushed.correlation.mergeCompleted).toBe(2)
        expect(ctx.getPhaseCorrelationCounters().linkCompleted).toBe(1)
        expect(ctx.getRunCorrelationCounters().mergeCompleted).toBe(2)
    })

    it('tracks correlated-action grants in interval and phase counters', () => {
        const ctx = new OperationRunContext()
        ctx.recordCorrelatedActionGranted()
        ctx.recordCorrelatedActionGranted()

        const flushed = ctx.flushEventCounters()
        expect(flushed.correlation.correlatedAction).toBe(2)
        expect(ctx.getPhaseCorrelationCounters().correlatedAction).toBe(2)
    })

    it('aggregates correlation skip reasons', () => {
        const ctx = new OperationRunContext()
        ctx.recordCorrelationSkipped('noIdentity')
        ctx.recordCorrelationSkipped('noIscAccountId')
        ctx.recordCorrelationSkipped('noIscAccountId')

        const flushed = ctx.flushEventCounters()
        expect(flushed.correlation.skippedNoIdentity).toBe(1)
        expect(flushed.correlation.skippedNoIscAccountId).toBe(2)
    })

    it('resets phase correlation counters at phaseStart boundary via LogService', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false, operationContext: 'accountList' })
        const ctx = new OperationRunContext()
        log.bindRunContext(ctx)

        ctx.recordCorrelationActivity({ kind: 'link', accounts: 2 })
        log.phaseStart(3, 'Refresh')
        expect(ctx.getPhaseCorrelationCounters()).toEqual(createEmptyCorrelationActivityCounters())
    })

    it('flushPhaseCorrelationSummary returns detail and resets phase counters', () => {
        const ctx = new OperationRunContext()
        ctx.recordCorrelationActivity({ kind: 'link', accounts: 5 })
        ctx.recordCorrelationCompleted({ kind: 'link', count: 2 })

        const summary = ctx.flushPhaseCorrelationSummary()
        expect(summary).toEqual({ correlations: 'link=1/5 completed=2' })
        expect(ctx.getPhaseCorrelationCounters()).toEqual(createEmptyCorrelationActivityCounters())
        expect(ctx.getRunCorrelationCounters().linkAccounts).toBe(5)
    })

    it('flushPhaseCorrelationSummary returns undefined when no activity', () => {
        const ctx = new OperationRunContext()
        expect(ctx.flushPhaseCorrelationSummary()).toBeUndefined()
    })

    it('increments refreshedCount', () => {
        const ctx = new OperationRunContext()
        expect(ctx.refreshedCount).toBe(0)
        ctx.incrementRefreshedCount()
        ctx.incrementRefreshedCount()
        expect(ctx.refreshedCount).toBe(2)
    })

    it('tracks cumulative outcomes separately from flushed tick counters', () => {
        const ctx = new OperationRunContext()
        ctx.recordEvent('nonMatch')
        ctx.recordEvent('autoMerged')
        ctx.recordEvent('formsQueued')

        const flushed = ctx.flushEventCounters()
        expect(flushed.nonMatch).toBe(1)
        expect(flushed.autoMerged).toBe(1)
        expect(flushed.formsQueued).toBe(1)
        expect(ctx.getCumulativeOutcomes()).toEqual({ nonMatch: 1, autoMerged: 1, formsQueued: 1, deferred: 0 })

        ctx.resetCumulativeOutcomes()
        expect(ctx.getCumulativeOutcomes()).toEqual({ nonMatch: 0, autoMerged: 0, formsQueued: 0, deferred: 0 })
    })
})

describe('LogService operation helpers', () => {
    beforeEach(() => {
        mockLogger.info.mockClear()
    })

    it('emits PHASE and STEP lines', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false, operationContext: 'accountList' })
        const ctx = new OperationRunContext()
        log.bindRunContext(ctx)

        log.phaseStart(4, 'Process')
        log.stepStart('uncorrelated-sweep', { accounts: 10 })
        log.setProgress(3, 10, 'analyzed')

        expect(mockLogger.info).toHaveBeenCalledWith('[accountList] PHASE 4 Process START')
        expect(mockLogger.info).toHaveBeenCalledWith('[accountList] STEP uncorrelated-sweep START accounts=10')
        expect(ctx.progress).toEqual({ done: 3, total: 10, unit: 'analyzed' })
    })

    it('emits PHASE END with correlation detail suffix', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false, operationContext: 'accountList' })
        const ctx = new OperationRunContext()
        log.bindRunContext(ctx)

        log.phaseStart(3, 'Refresh')
        ctx.recordCorrelationActivity({ kind: 'link', accounts: 4 })
        log.phaseEnd(3, 'Refresh', log.flushPhaseCorrelationSummary())

        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringMatching(/\[accountList\] PHASE 3 Refresh END correlations link=1\/4 elapsed=/)
        )
    })

    it('records refreshed accounts only during Refresh phase', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false, operationContext: 'accountList' })
        const ctx = new OperationRunContext()
        log.bindRunContext(ctx)

        ctx.phase = 'Process'
        log.recordRefreshedAccount()
        expect(ctx.refreshedCount).toBe(0)

        ctx.phase = 'Refresh'
        log.recordRefreshedAccount()
        log.recordRefreshedAccount()
        expect(ctx.refreshedCount).toBe(2)
    })
})



