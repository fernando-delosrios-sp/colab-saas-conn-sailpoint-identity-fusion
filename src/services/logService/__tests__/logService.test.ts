const mockLogger = {
    level: 'info',
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}

jest.mock('@sailpoint/connector-sdk', () => {
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

import { LogService, PhaseTimer, TrackedOperation } from '../logService'

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
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const timer = log.timer()
        jest.advanceTimersByTime(1000)
        timer.phase('Step A', 'info', 'Setup')
        jest.advanceTimersByTime(2500)
        timer.phase('Step B', 'info', 'Fetch')
        timer.recordElapsed('Output', 100)
        expect(timer.getPhaseBreakdown()).toEqual([
            { phase: 'Setup', elapsed: '1.0S' },
            { phase: 'Fetch', elapsed: '2.5S' },
            { phase: 'Output', elapsed: '100MS' },
        ])
        jest.useRealTimers()
    })
})

describe('LogService.metric', () => {
    beforeEach(() => {
        mockLogger.level = 'info'
        mockLogger.info.mockClear()
    })

    it('logs duration without data', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const startedAt = Date.now()
        jest.advanceTimersByTime(1234)
        log.metric('test.operation', startedAt)
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: test.operation durationMs=1234')
        )
        jest.useRealTimers()
    })

    it('logs duration with structured data', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const startedAt = Date.now()
        jest.advanceTimersByTime(567)
        log.metric('outputPhase.sendAccounts', startedAt, { count: 500, batchSize: 100 })
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: outputPhase.sendAccounts durationMs=567 count=500 batchSize=100')
        )
        jest.useRealTimers()
    })

    it('logs duration with single data field', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const startedAt = Date.now()
        jest.advanceTimersByTime(89)
        log.metric('outputPhase.saveAttributeState', startedAt)
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: outputPhase.saveAttributeState durationMs=89')
        )
        jest.useRealTimers()
    })
})

describe('TrackedOperation via LogService.track', () => {
    beforeEach(() => {
        mockLogger.level = 'info'
        mockLogger.info.mockClear()
    })

    it('emits metric with duration on done()', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const op = log.track('test.operation')
        jest.advanceTimersByTime(1234)
        op.done()
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: test.operation durationMs=1234')
        )
        jest.useRealTimers()
    })

    it('emits metric with structured data on done()', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const op = log.track('outputPhase.sendAccounts')
        jest.advanceTimersByTime(567)
        op.done({ count: 500, batchSize: 100 })
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: outputPhase.sendAccounts durationMs=567 count=500 batchSize=100')
        )
        jest.useRealTimers()
    })

    it('returns elapsed ms from done()', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const op = log.track('test.elapsed')
        jest.advanceTimersByTime(2500)
        const elapsed = op.done()
        expect(elapsed).toBe(2500)
        jest.useRealTimers()
    })

    it('reports intermediate progress via elapsedMs() without emitting a metric', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const op = log.track('test.progress')
        jest.advanceTimersByTime(500)
        expect(op.elapsedMs()).toBe(500)
        expect(mockLogger.info).not.toHaveBeenCalled()
        jest.advanceTimersByTime(300)
        op.done({ count: 3 })
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Performance metric: test.progress durationMs=800 count=3')
        )
        jest.useRealTimers()
    })
})
