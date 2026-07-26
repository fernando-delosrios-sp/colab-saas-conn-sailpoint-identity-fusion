import { LogService } from '../logService'
import { OperationRunContext, createEmptyEventCounters } from '../operationRunContext'

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
        expect(ctx.peekEventCounters()).toEqual(createEmptyEventCounters())
    })

    it('records correlation triggers and account totals', () => {
        const ctx = new OperationRunContext()
        ctx.recordEvent('correlation', { accounts: 3 })
        ctx.recordEvent('correlation', { accounts: 2 })

        const flushed = ctx.flushEventCounters()
        expect(flushed.correlationTriggers).toBe(2)
        expect(flushed.correlationAccounts).toBe(5)
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
        expect(ctx.getCumulativeOutcomes()).toEqual({ nonMatch: 1, autoMerged: 1, formsQueued: 1 })

        ctx.resetCumulativeOutcomes()
        expect(ctx.getCumulativeOutcomes()).toEqual({ nonMatch: 0, autoMerged: 0, formsQueued: 0 })
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

