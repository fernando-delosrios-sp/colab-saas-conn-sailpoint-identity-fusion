/**
 * Per-pagination-stream circuit: gateway-failure pool, then shed at
 * `min(inFlightGatewayFailureCap, window)` with no cooldown or probe.
 */

export type GatewayPoolAction = 'continue' | 'shed'

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
 *
 * A page key (offset or searchAfter cursor) enters the gateway-failure pool on 504/timeout
 * and leaves only when that same page succeeds. At threshold the stream sheds.
 */
export class PaginationCircuit {
    private readonly pool = new Set<string>()
    private shedController = new AbortController()

    constructor(
        private readonly inFlightGatewayFailureCap: number,
        window: number,
        private readonly logWarn: (message: string) => void,
        private readonly context: string | undefined
    ) {
        this.windowValue = Math.max(1, window)
    }

    private readonly windowValue: number

    /** This stream’s concurrent page cap (never below 1). */
    get window(): number {
        return this.windowValue
    }

    /** `min(inFlightGatewayFailureCap, window)`. */
    get threshold(): number {
        return Math.min(this.inFlightGatewayFailureCap, this.windowValue)
    }

    get poolSize(): number {
        return this.pool.size
    }

    get shedSignal(): AbortSignal {
        return this.shedController.signal
    }

    get isShedding(): boolean {
        return this.shedController.signal.aborted
    }

    /**
     * Remove a page from the pool after that page returns success.
     */
    recordSuccess(pageKey: string): void {
        if (!this.pool.delete(pageKey)) {
            return
        }
        this.logPoolChange('leave', pageKey)
    }

    /**
     * Record a gateway failure for `pageKey`.
     * `continue` — below threshold; `shed` — pool reached `min(cap, window)`.
     */
    noteGatewayFailure(pageKey: string): GatewayPoolAction {
        this.pool.add(pageKey)
        this.logPoolChange('enter', pageKey)
        if (this.pool.size >= this.threshold) {
            return 'shed'
        }
        return 'continue'
    }

    shed(positionLabel: string): void {
        if (this.shedController.signal.aborted) return
        this.logWarn(
            `Pagination circuit shedding stream (${this.context ?? 'paginate'}) at ${positionLabel} pool ${this.pool.size}/${this.threshold}`
        )
        this.shedController.abort(new Error('Pagination circuit shed'))
    }

    private logPoolChange(action: 'enter' | 'leave', pageKey: string): void {
        const approaching = this.pool.size >= Math.max(1, this.threshold - 1)
        if (!approaching && action === 'leave') {
            return
        }
        if (!approaching && action === 'enter' && this.pool.size < this.threshold - 1) {
            return
        }
        this.logWarn(
            `Pagination circuit pool ${action} ${pageKey} (${this.context ?? 'paginate'}) pool ${this.pool.size}/${this.threshold}`
        )
    }
}
