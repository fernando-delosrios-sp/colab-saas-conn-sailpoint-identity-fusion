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
})
