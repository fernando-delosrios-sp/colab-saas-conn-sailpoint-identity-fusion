import {
    EventLoopWatchdog,
    formatBlockedWarning,
    formatEventLoopDiagnostics,
    formatRunContextLabel,
} from '../eventLoopWatchdog'
import { OperationRunContext } from '../operationRunContext'
import { LogService } from '../logService'

/** Drives a clock the watchdog reads, independent of when its timer callbacks fire. */
function createClock(startMs = 0) {
    let current = startMs
    return {
        now: () => current,
        advance: (ms: number) => {
            current += ms
        },
    }
}

describe('formatRunContextLabel', () => {
    it('returns undefined when no run context is attached', () => {
        expect(formatRunContextLabel(null)).toBeUndefined()
    })

    it('summarizes phase, step, and Fetch population progress', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        runContext.step = 'ingest-identities'
        runContext.setFetchPopulationProgress('identities', 750, 2000)

        expect(formatRunContextLabel(runContext)).toBe('phase=Fetch step=ingest-identities identities=750/2000')
    })
})

describe('formatBlockedWarning', () => {
    it('reports the blocked window with the context on both sides of the stall', () => {
        expect(formatBlockedWarning(31_400, 'phase=Fetch step=ingest-identities', 'phase=Fetch step=match')).toBe(
            'WARN EVENT_LOOP blocked 31.4s | before=phase=Fetch step=ingest-identities | now=phase=Fetch step=match'
        )
    })

    it('omits context segments that are unavailable', () => {
        expect(formatBlockedWarning(6_000, undefined, undefined)).toBe('WARN EVENT_LOOP blocked 6.0s')
    })
})

describe('EventLoopWatchdog', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('stays quiet while samples arrive on schedule', () => {
        const warn = vi.fn()
        const clock = createClock()
        const watchdog = new EventLoopWatchdog({ warn } as unknown as LogService, {
            sampleIntervalMs: 1_000,
            blockThresholdMs: 5_000,
            now: clock.now,
        })

        watchdog.start()
        for (let tick = 0; tick < 5; tick++) {
            clock.advance(1_000)
            vi.advanceTimersByTime(1_000)
        }

        expect(warn).not.toHaveBeenCalled()
        watchdog.stop()
    })

    it('warns with the context captured before the stall when a sample arrives late', () => {
        const warn = vi.fn()
        const clock = createClock()
        let context = 'phase=Fetch step=ingest-identities'
        const watchdog = new EventLoopWatchdog({ warn } as unknown as LogService, {
            sampleIntervalMs: 1_000,
            blockThresholdMs: 5_000,
            now: clock.now,
            getContext: () => context,
        })

        watchdog.start()
        clock.advance(1_000)
        vi.advanceTimersByTime(1_000)

        context = 'phase=Fetch step=fetch-source-accounts'
        clock.advance(31_000)
        vi.advanceTimersByTime(1_000)

        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toBe(
            'WARN EVENT_LOOP blocked 30.0s | before=phase=Fetch step=ingest-identities | now=phase=Fetch step=fetch-source-accounts'
        )
        watchdog.stop()
    })

    it('reports the worst block of the run when stopped', () => {
        const warn = vi.fn()
        const clock = createClock()
        const watchdog = new EventLoopWatchdog({ warn } as unknown as LogService, {
            sampleIntervalMs: 1_000,
            blockThresholdMs: 5_000,
            now: clock.now,
        })

        watchdog.start()
        clock.advance(9_000)
        vi.advanceTimersByTime(1_000)
        clock.advance(21_000)
        vi.advanceTimersByTime(1_000)

        watchdog.stop()

        expect(warn).toHaveBeenLastCalledWith('WARN EVENT_LOOP worst block this run 20.0s')
    })

    it('stays silent on stop when no block crossed the threshold', () => {
        const warn = vi.fn()
        const clock = createClock()
        const watchdog = new EventLoopWatchdog({ warn } as unknown as LogService, {
            sampleIntervalMs: 1_000,
            blockThresholdMs: 5_000,
            now: clock.now,
        })

        watchdog.start()
        clock.advance(1_000)
        vi.advanceTimersByTime(1_000)
        watchdog.stop()

        expect(warn).not.toHaveBeenCalled()
    })

    it('reports on both the logger and the unbuffered channel', () => {
        const warn = vi.fn()
        const emitUnbuffered = vi.fn()
        const clock = createClock()
        const watchdog = new EventLoopWatchdog({ warn } as unknown as LogService, {
            sampleIntervalMs: 1_000,
            blockThresholdMs: 5_000,
            now: clock.now,
            emitUnbuffered,
        })

        watchdog.start()
        clock.advance(31_000)
        vi.advanceTimersByTime(1_000)

        expect(emitUnbuffered).toHaveBeenCalledWith('WARN EVENT_LOOP blocked 30.0s')
        expect(warn).toHaveBeenCalledWith('WARN EVENT_LOOP blocked 30.0s')
        watchdog.stop()
    })

    it('still logs when the unbuffered channel throws', () => {
        const warn = vi.fn()
        const clock = createClock()
        const watchdog = new EventLoopWatchdog({ warn } as unknown as LogService, {
            sampleIntervalMs: 1_000,
            blockThresholdMs: 5_000,
            now: clock.now,
            emitUnbuffered: () => {
                throw new Error('EAGAIN')
            },
        })

        watchdog.start()
        clock.advance(31_000)

        expect(() => vi.advanceTimersByTime(1_000)).not.toThrow()
        expect(warn).toHaveBeenCalledWith('WARN EVENT_LOOP blocked 30.0s')
        watchdog.stop()
    })

    it('stops sampling once stopped', () => {
        const warn = vi.fn()
        const clock = createClock()
        const watchdog = new EventLoopWatchdog({ warn } as unknown as LogService, {
            sampleIntervalMs: 1_000,
            blockThresholdMs: 5_000,
            now: clock.now,
        })

        watchdog.start()
        watchdog.stop()
        clock.advance(60_000)
        vi.advanceTimersByTime(60_000)

        expect(warn).not.toHaveBeenCalled()
    })

    it('appends heap/rss/gc diagnostics to blocked warnings when getDiagnostics is provided', () => {
        const warn = vi.fn()
        const clock = createClock()
        const watchdog = new EventLoopWatchdog({ warn } as unknown as LogService, {
            sampleIntervalMs: 1_000,
            blockThresholdMs: 5_000,
            now: clock.now,
            getContext: () => 'phase=Fetch managed-accounts=100/1000',
            getDiagnostics: () =>
                formatEventLoopDiagnostics(420, {
                    rss: 1200 * 1024 * 1024,
                    heapTotal: 1000 * 1024 * 1024,
                    heapUsed: 950 * 1024 * 1024,
                    external: 0,
                    arrayBuffers: 0,
                }),
        })

        watchdog.start()
        clock.advance(8_000)
        vi.advanceTimersByTime(1_000)

        expect(warn).toHaveBeenCalledWith(
            'WARN EVENT_LOOP blocked 7.0s | before=phase=Fetch managed-accounts=100/1000 | now=phase=Fetch managed-accounts=100/1000 | mem=1200.00MB heap=950.00MB gc=420ms'
        )
        watchdog.stop()
    })
})
