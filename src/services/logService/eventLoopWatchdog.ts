import { writeSync } from 'fs'
import { PerformanceObserver } from 'perf_hooks'
import type { LogService } from './logService'
import { FETCH_POPULATIONS, type OperationRunContext } from './operationRunContext'

/** Sampling cadence — bounds how precisely a blocked window can be attributed. */
const SAMPLE_INTERVAL_MS = 1_000
/** Shorter gaps are ordinary GC or I/O noise rather than starvation. */
const BLOCK_THRESHOLD_MS = 5_000

export interface EventLoopWatchdogOptions {
    sampleIntervalMs?: number
    blockThresholdMs?: number
    /** Pipeline position recorded with each sample so a stall can be attributed to a phase or step. */
    getContext?: () => string | undefined
    /** Optional runtime diagnostics appended to block warnings (e.g. heap/RSS/GC). */
    getDiagnostics?: (gcMsSinceLastSample: number) => string | undefined
    /** Enable Node perf_hooks GC observer to measure GC pause time during blocked windows. */
    observeGc?: boolean
    now?: () => number
    /** Unbuffered channel used alongside the logger; see {@link writeUnbuffered}. */
    emitUnbuffered?: (line: string) => void
}

/**
 * Writes straight to the stdout file descriptor, bypassing the SDK's buffered pino logger.
 * A starved event loop never drains that buffer, so this is the only channel that can still
 * surface a warning when the loop is the thing at fault.
 */
function writeUnbuffered(line: string): void {
    writeSync(1, `${line}\n`)
}

/**
 * Summarizes where the pipeline stood when a sample was taken.
 *
 * @param runContext - Run context of the operation, or null before one is attached.
 * @returns Compact `phase`/`step`/population-or-progress label, or undefined when nothing is known.
 */
export function formatRunContextLabel(runContext: OperationRunContext | null | undefined): string | undefined {
    if (!runContext) return undefined
    const parts: string[] = []
    if (runContext.phase) parts.push(`phase=${runContext.phase}`)
    if (runContext.step) parts.push(`step=${runContext.step}`)
    if (runContext.phase === 'Fetch') {
        const fetchProgress = runContext.getFetchPopulationProgress()
        for (const population of FETCH_POPULATIONS) {
            const progress = fetchProgress[population]
            if (progress && (progress.done > 0 || progress.total > 0)) {
                parts.push(`${population}=${progress.done}/${progress.total}`)
            }
        }
    } else if (runContext.progress) {
        parts.push(`progress=${runContext.progress.done}/${runContext.progress.total}`)
    }
    return parts.length > 0 ? parts.join(' ') : undefined
}

function formatBlockedSeconds(blockedMs: number): string {
    return `${(blockedMs / 1000).toFixed(1)}s`
}

function formatMb(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(2)
}

/**
 * Formats memory and GC diagnostics for an event-loop block warning so operators can
 * immediately tell V8 GC thrashing / heap saturation apart from JS CPU starvation.
 * Matches the `mem=<rss>MB heap=<heapUsed>MB` convention used by `STATUS` lines.
 */
export function formatEventLoopDiagnostics(
    gcMsSinceLastSample: number,
    memory: NodeJS.MemoryUsage = process.memoryUsage()
): string {
    const parts = [`mem=${formatMb(memory.rss)}MB`, `heap=${formatMb(memory.heapUsed)}MB`]
    if (gcMsSinceLastSample >= 1) {
        parts.push(`gc=${Math.round(gcMsSinceLastSample)}ms`)
    }
    return parts.join(' ')
}

/**
 * Formats the warning emitted once the event loop recovers from a blocked window.
 *
 * @param blockedMs - How long timers were starved.
 * @param before - Context recorded at the last healthy sample.
 * @param after - Context recorded once sampling resumed.
 * @param diagnostics - Optional runtime diagnostics (e.g. heap, rss, gc).
 */
export function formatBlockedWarning(
    blockedMs: number,
    before: string | undefined,
    after: string | undefined,
    diagnostics?: string
): string {
    const parts = [`WARN EVENT_LOOP blocked ${formatBlockedSeconds(blockedMs)}`]
    if (before) parts.push(`before=${before}`)
    if (after) parts.push(`now=${after}`)
    if (diagnostics) parts.push(diagnostics)
    return parts.join(' | ')
}

/**
 * Detects event-loop starvation, the condition that silences the platform keep-alive
 * and the operation heartbeat. Samples cannot run while the loop is blocked, so each
 * warning is emitted after the loop recovers and reports the pipeline position on both
 * sides of the gap.
 */
export class EventLoopWatchdog {
    private readonly sampleIntervalMs: number
    private readonly blockThresholdMs: number
    private readonly now: () => number
    private readonly emitUnbuffered: (line: string) => void
    private timer?: ReturnType<typeof setTimeout>
    private gcObserver?: PerformanceObserver
    private gcMsSinceLastSample = 0
    private lastContext?: string
    private maxBlockedMsValue = 0

    constructor(
        private readonly log: LogService,
        private readonly options: EventLoopWatchdogOptions = {}
    ) {
        this.sampleIntervalMs = options.sampleIntervalMs ?? SAMPLE_INTERVAL_MS
        this.blockThresholdMs = options.blockThresholdMs ?? BLOCK_THRESHOLD_MS
        this.now = options.now ?? Date.now
        this.emitUnbuffered = options.emitUnbuffered ?? writeUnbuffered
    }

    /**
     * Reports on both channels: the logger for normal routing, and an unbuffered write in case
     * the logger's buffer is the reason the run went quiet. A line present on one channel but
     * not the other identifies which of the two failed.
     */
    private report(line: string): void {
        try {
            this.emitUnbuffered(line)
        } catch {
            // A non-blocking stdout pipe can reject the write; diagnostics must never break the run.
        }
        this.log.warn(line)
    }

    /** Longest blocked window observed since the watchdog started. */
    get maxBlockedMs(): number {
        return this.maxBlockedMsValue
    }

    start(): void {
        if (this.timer) return
        this.lastContext = this.options.getContext?.()
        this.gcMsSinceLastSample = 0
        if (this.options.observeGc) {
            try {
                this.gcObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        this.gcMsSinceLastSample += entry.duration
                    }
                })
                this.gcObserver.observe({ entryTypes: ['gc'] })
            } catch {
                this.gcObserver = undefined
            }
        }
        this.schedule()
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = undefined
        }
        if (this.gcObserver) {
            try {
                this.gcObserver.disconnect()
            } catch {
                // Ignore observer teardown errors.
            }
            this.gcObserver = undefined
        }
        if (this.maxBlockedMsValue >= this.blockThresholdMs) {
            this.report(`WARN EVENT_LOOP worst block this run ${formatBlockedSeconds(this.maxBlockedMsValue)}`)
        }
        this.maxBlockedMsValue = 0
        this.gcMsSinceLastSample = 0
        this.lastContext = undefined
    }

    private schedule(): void {
        const dueAt = this.now() + this.sampleIntervalMs
        this.timer = setTimeout(() => {
            this.timer = undefined
            this.sample(dueAt)
            this.schedule()
        }, this.sampleIntervalMs)
        this.timer.unref?.()
    }

    private sample(dueAt: number): void {
        const blockedMs = this.now() - dueAt
        const context = this.options.getContext?.()
        const gcMs = this.gcMsSinceLastSample
        this.gcMsSinceLastSample = 0
        if (blockedMs >= this.blockThresholdMs) {
            this.maxBlockedMsValue = Math.max(this.maxBlockedMsValue, blockedMs)
            const diagnostics = this.options.getDiagnostics?.(gcMs)
            this.report(formatBlockedWarning(blockedMs, this.lastContext, context, diagnostics))
        }
        this.lastContext = context
    }
}
