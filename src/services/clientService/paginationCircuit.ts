/**
 * Per-pagination-stream circuit: shed after consecutive gateway failures,
 * one cooldown, one probe, then resume or abort.
 */

export type GatewayStreakAction = 'continue' | 'shed' | 'open'

/** Wait `ms`, aborting if `signal` fires. Zero/negative ms still honor an already-aborted signal. */
async function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
        throw signal.reason ?? new Error('Aborted')
    }
    if (ms <= 0) {
        return
    }
    await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        const onAbort = () => {
            clearTimeout(timeoutId)
            reject(signal?.reason ?? new Error('Aborted'))
        }
        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

/** True when the error (or signal) represents an abort rather than an HTTP outcome. */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) return true
    if (!error) return false
    const err = error as { name?: string; message?: string }
    return err.name === 'AbortError' || /aborted/i.test(String(err.message ?? ''))
}

/**
 * Pagination circuit state for one `client.call` pagination stream.
 * Not a queue-wide or tenant-wide breaker.
 */
export class PaginationCircuit {
    private gatewayStreak = 0
    private cooldownsUsed = 0
    private shedController = new AbortController()

    constructor(
        private readonly consecutiveGatewayFailures: number,
        private readonly paginationCooldownMs: number,
        private readonly maxCooldownsPerStream: number,
        private readonly logWarn: (message: string) => void,
        private readonly context: string | undefined,
        private readonly callerSignal?: AbortSignal
    ) {}

    get shedSignal(): AbortSignal {
        return this.shedController.signal
    }

    get isShedding(): boolean {
        return this.shedController.signal.aborted
    }

    recordSuccess(): void {
        this.gatewayStreak = 0
    }

    /**
     * Record a completed page outcome that is a gateway failure.
     * `continue` — below threshold; `shed` — first streak, cooldown remaining; `open` — no cooldown left.
     */
    noteGatewayFailure(): GatewayStreakAction {
        this.gatewayStreak += 1
        if (this.gatewayStreak < this.consecutiveGatewayFailures) {
            return 'continue'
        }
        if (this.cooldownsUsed >= this.maxCooldownsPerStream) {
            return 'open'
        }
        return 'shed'
    }

    shed(positionLabel: string): void {
        if (this.shedController.signal.aborted) return
        this.logWarn(
            `Pagination circuit shedding stream (${this.context ?? 'paginate'}) at ${positionLabel} after ${this.gatewayStreak} consecutive gateway failures`
        )
        this.shedController.abort(new Error('Pagination circuit shed'))
    }

    async cooldown(): Promise<void> {
        this.cooldownsUsed += 1
        this.logWarn(`Pagination circuit cooldown ${this.paginationCooldownMs}ms (${this.context ?? 'paginate'})`)
        await sleepAbortable(this.paginationCooldownMs, this.callerSignal)
    }

    beginProbe(positionLabel: string): void {
        this.logWarn(`Pagination circuit probe (${this.context ?? 'paginate'}) at ${positionLabel}`)
    }

    resumeAfterSuccessfulProbe(): void {
        this.gatewayStreak = 0
        this.shedController = new AbortController()
    }

    abortAfterFailedProbe(positionLabel: string): void {
        this.logWarn(
            `Pagination circuit abort after failed probe (${this.context ?? 'paginate'}) at ${positionLabel}`
        )
    }

    abortAfterSecondStreak(positionLabel: string): void {
        this.logWarn(
            `Pagination circuit abort after second gateway-failure streak (${this.context ?? 'paginate'}) at ${positionLabel}`
        )
    }
}
