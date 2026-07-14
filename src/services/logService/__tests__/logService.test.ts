const mockLogger = {
    level: 'info',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}

vi.mock('@sailpoint/connector-sdk', () => {
    class MockConnectorError extends Error {
        constructor(message: string) {
            super(message)
            this.name = 'ConnectorError'
        }
    }

    return {
        logger: mockLogger,
        ConnectorError: MockConnectorError,
        ConnectorErrorType: { Generic: 'Generic' },
    }
})

import { LogService, PhaseTimer } from '../logService'

describe('LogService aggregation issue summary', () => {
    beforeEach(() => {
        mockLogger.level = 'info'
        mockLogger.debug.mockClear()
        mockLogger.info.mockClear()
        mockLogger.warn.mockClear()
        mockLogger.error.mockClear()
    })

    it('tracks warning/error counts and keeps unique samples', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })

        log.warn('warning A')
        log.warn('warning A')
        log.error('error A')

        const summary = log.getAggregationIssueSummary()
        expect(summary.warningCount).toBe(2)
        expect(summary.errorCount).toBe(1)
        expect(summary.warningSamples).toEqual(['warning A'])
        expect(summary.errorSamples).toEqual(['error A'])
    })

    it('caps warning samples to avoid verbose report payloads', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })

        for (let i = 0; i < 8; i++) {
            log.warn(`warning ${i}`)
        }

        const summary = log.getAggregationIssueSummary()
        expect(summary.warningCount).toBe(8)
        expect(summary.warningSamples).toHaveLength(6)
        expect(summary.warningSamples[0]).toBe('warning 0')
        expect(summary.warningSamples[5]).toBe('warning 5')
    })

    it('truncates long issue messages for size safety', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const veryLongMessage = `warning ${'x'.repeat(220)}`

        log.warn(veryLongMessage)

        const [sample] = log.getAggregationIssueSummary().warningSamples
        expect(sample.endsWith('...')).toBe(true)
        expect(sample.length).toBe(180)
    })

    it('includes assert/crash pathways in issue summary tracking', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })

        log.assert(false, 'assert warning', undefined, 'warn')
        log.assert(false, 'assert error')
        log.assert(true, 'ignored')

        const summary = log.getAggregationIssueSummary()
        expect(summary.warningCount).toBe(1)
        expect(summary.errorCount).toBe(1)
        expect(summary.warningSamples).toEqual(['assert warning'])
        expect(summary.errorSamples).toEqual(['assert error'])
    })
})

describe('PhaseTimer.formatElapsed', () => {
    it('keeps short durations in milliseconds or decimal seconds', () => {
        expect(PhaseTimer.formatElapsed(532)).toBe('532MS')
        expect(PhaseTimer.formatElapsed(1200)).toBe('1.2S')
        expect(PhaseTimer.formatElapsed(59_900)).toBe('59.9S')
    })

    it('formats long durations using minutes and hours', () => {
        expect(PhaseTimer.formatElapsed(3_291_700)).toBe('54M 52S')
        expect(PhaseTimer.formatElapsed(3_661_000)).toBe('1H 1M 1S')
    })
})

describe('PhaseTimer breakdown', () => {
    it('records ordered phase entries from phase() and recordElapsed()', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const timer = log.timer()
        vi.advanceTimersByTime(1000)
        timer.phase('Step A', 'info', 'Setup')
        vi.advanceTimersByTime(2500)
        timer.phase('Step B', 'info', 'Fetch')
        timer.recordElapsed('Output', 100)
        expect(timer.getPhaseBreakdown()).toEqual([
            { phase: 'Setup', elapsed: '1.0S' },
            { phase: 'Fetch', elapsed: '2.5S' },
            { phase: 'Output', elapsed: '100MS' },
        ])
        vi.useRealTimers()
    })
})

describe('LogService.metric', () => {
    beforeEach(() => {
        mockLogger.level = 'info'
        mockLogger.info.mockClear()
    })

    it('logs duration without data', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const startedAt = Date.now()
        vi.advanceTimersByTime(1234)
        log.metric('test.operation', startedAt)
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: test.operation durationMs=1234')
        )
        vi.useRealTimers()
    })

    it('logs duration with structured data', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const startedAt = Date.now()
        vi.advanceTimersByTime(567)
        log.metric('outputPhase.sendAccounts', startedAt, { count: 500, batchSize: 100 })
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: outputPhase.sendAccounts durationMs=567 count=500 batchSize=100')
        )
        vi.useRealTimers()
    })

    it('logs duration with single data field', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const startedAt = Date.now()
        vi.advanceTimersByTime(89)
        log.metric('outputPhase.saveAttributeState', startedAt)
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: outputPhase.saveAttributeState durationMs=89')
        )
        vi.useRealTimers()
    })
})

describe('TrackedOperation via LogService.track', () => {
    beforeEach(() => {
        mockLogger.level = 'info'
        mockLogger.info.mockClear()
    })

    it('emits metric with duration on done()', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const op = log.track('test.operation')
        vi.advanceTimersByTime(1234)
        op.done()
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: test.operation durationMs=1234')
        )
        vi.useRealTimers()
    })

    it('emits metric with structured data on done()', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const op = log.track('outputPhase.sendAccounts')
        vi.advanceTimersByTime(567)
        op.done({ count: 500, batchSize: 100 })
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: outputPhase.sendAccounts durationMs=567 count=500 batchSize=100')
        )
        vi.useRealTimers()
    })

    it('returns elapsed ms from done()', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const op = log.track('test.elapsed')
        vi.advanceTimersByTime(2500)
        const elapsed = op.done()
        expect(elapsed).toBe(2500)
        vi.useRealTimers()
    })

    it('reports intermediate progress via elapsedMs() without emitting a metric', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const op = log.track('test.progress')
        vi.advanceTimersByTime(500)
        expect(op.elapsedMs()).toBe(500)
        expect(mockLogger.info).not.toHaveBeenCalled()
        vi.advanceTimersByTime(300)
        op.done({ count: 3 })
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: test.progress durationMs=800 count=3')
        )
        vi.useRealTimers()
    })
})
