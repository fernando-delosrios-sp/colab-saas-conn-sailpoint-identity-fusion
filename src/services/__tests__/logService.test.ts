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
        expect(PhaseTimer.formatElapsed(532)).toBe('532ms')
        expect(PhaseTimer.formatElapsed(1200)).toBe('1.2s')
        expect(PhaseTimer.formatElapsed(59_900)).toBe('59.9s')
    })

    it('formats long durations using minutes and hours', () => {
        expect(PhaseTimer.formatElapsed(3_291_700)).toBe('54m 52s')
        expect(PhaseTimer.formatElapsed(3_661_000)).toBe('1h 1m 1s')
    })
})
