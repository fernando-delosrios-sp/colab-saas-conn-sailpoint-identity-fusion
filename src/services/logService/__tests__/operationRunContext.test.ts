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

    it('records decision events by type', () => {
        const ctx = new OperationRunContext()
        ctx.recordEvent('decision', { type: 'newIdentity' })
        ctx.recordEvent('decision', { type: 'merge' })
        ctx.recordEvent('decision', { type: 'noMatch' })
        ctx.recordEvent('decision', { type: 'autoMerge' })

        const flushed = ctx.flushEventCounters()
        expect(flushed.decisionNewIdentity).toBe(1)
        expect(flushed.decisionMerge).toBe(1)
        expect(flushed.decisionNoMatch).toBe(1)
        expect(flushed.decisionAutoMerge).toBe(1)
        expect(ctx.getCumulativeOutcomes()).toEqual({
            nonMatch: 0,
            autoMerged: 0,
            formsQueued: 0,
            deferred: 0,
            decisionNewIdentity: 1,
            decisionMerge: 1,
            decisionNoMatch: 1,
            decisionAutoMerge: 1,
        })
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

    it('flushPhaseCorrelationSummary omits correlated-action when aggregation summaries are excluded', () => {
        const ctx = new OperationRunContext()
        ctx.excludeCorrelatedActionInSummaries = true
        ctx.recordCorrelationActivity({ kind: 'link', accounts: 1 })
        ctx.recordCorrelatedActionGranted()

        const summary = ctx.flushPhaseCorrelationSummary()
        expect(summary).toEqual({ correlations: 'link=1/1' })
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
        expect(ctx.getCumulativeOutcomes()).toEqual({
            nonMatch: 1,
            autoMerged: 1,
            formsQueued: 1,
            deferred: 0,
            decisionNewIdentity: 0,
            decisionMerge: 0,
            decisionNoMatch: 0,
            decisionAutoMerge: 0,
        })

        ctx.resetCumulativeOutcomes()
        expect(ctx.getCumulativeOutcomes()).toEqual({
            nonMatch: 0,
            autoMerged: 0,
            formsQueued: 0,
            deferred: 0,
            decisionNewIdentity: 0,
            decisionMerge: 0,
            decisionNoMatch: 0,
            decisionAutoMerge: 0,
        })
    })

    it('ignores refresh sub-step recordings when phase is Process', () => {
        const ctx = new OperationRunContext()
        ctx.phase = 'Process'
        ctx.recordRefreshSubStep('prelude', 12)
        ctx.incrementRefreshAccountsProcessed()
        expect(ctx.flushRefreshMetricsSummary()).toBeUndefined()

        ctx.phase = 'Refresh'
        ctx.incrementRefreshAccountsProcessed()
        expect(ctx.flushRefreshMetricsSummary()).toEqual(
            expect.objectContaining({
                accounts: 1,
                preludeMs: 0,
            })
        )
    })

    it('accumulates refresh sub-step recordings across multiple calls', () => {
        const ctx = new OperationRunContext()
        ctx.phase = 'Refresh'
        ctx.recordRefreshSubStep('map', 3)
        ctx.recordRefreshSubStep('map', 5)
        ctx.recordRefreshSubStep('normalDefine', 2, { definitionsEvaluated: 4 })
        ctx.incrementRefreshAccountsProcessed()
        ctx.incrementRefreshAccountsProcessed()

        expect(ctx.flushRefreshMetricsSummary()).toEqual(
            expect.objectContaining({
                accounts: 2,
                mapMs: 8,
                normalDefineMs: 2,
                definitionsEvaluated: 4,
            })
        )
    })

    it('flush returns undefined when accountsProcessed is 0', () => {
        const ctx = new OperationRunContext()
        ctx.phase = 'Refresh'
        ctx.resetRefreshMetrics()
        ctx.recordRefreshSubStep('prelude', 4)
        expect(ctx.flushRefreshMetricsSummary()).toBeUndefined()
    })

    it('flush includes accounts and bucket millisecond totals', () => {
        const ctx = new OperationRunContext()
        ctx.phase = 'Refresh'
        ctx.recordRefreshSubStep('prelude', 1.4)
        ctx.recordRefreshSubStep('managedLayer', 2.2)
        ctx.recordRefreshSubStep('map', 3)
        ctx.recordRefreshSubStep('normalDefine', 4)
        ctx.incrementRefreshAccountsProcessed()

        expect(ctx.flushRefreshMetricsSummary()).toEqual(
            expect.objectContaining({
                accounts: 1,
                preludeMs: 1,
                managedLayerMs: 2,
                mapMs: 3,
                normalDefineMs: 4,
            })
        )
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
        log.setFetchPopulationProgress('managed-accounts', 4, 20)

        expect(mockLogger.info).toHaveBeenCalledWith('[accountList] PHASE 4 Process START')
        expect(mockLogger.info).toHaveBeenCalledWith('[accountList] STEP uncorrelated-sweep START accounts=10')
        expect(ctx.progress).toEqual({ done: 3, total: 10, unit: 'analyzed' })
        expect(ctx.getFetchPopulationProgress()).toEqual({
            'managed-accounts': { done: 4, total: 20 },
        })
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

    it('passthrough reset and flush Refresh metrics to run context', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false, operationContext: 'accountList' })
        const ctx = new OperationRunContext()
        log.bindRunContext(ctx)
        ctx.phase = 'Refresh'
        ctx.recordRefreshSubStep('prelude', 9)
        ctx.incrementRefreshAccountsProcessed()
        log.resetRefreshMetrics()
        expect(log.flushRefreshMetricsSummary()).toBeUndefined()

        ctx.recordRefreshSubStep('map', 1)
        ctx.incrementRefreshAccountsProcessed()
        expect(log.flushRefreshMetricsSummary()).toEqual(expect.objectContaining({ accounts: 1, mapMs: 1 }))
    })
})
