import type { QueueConfig } from './types'
import { internalConfig } from '../../data/config'
import { runtimeDefaults } from '../../data/config/settings/advancedConnectionSettings'

/**
 * Sliding-window rate limiter for API request starts.
 * Tracks timestamps of recent acquires and blocks until the oldest exits the window.
 */
export class SlidingWindowRateLimiter {
    private timestamps: number[] = []
    private gate: Promise<void> = Promise.resolve()

    constructor(
        private readonly windowMs: number,
        private readonly maxRequests: number
    ) {}

    /** Returns true if a slot was acquired immediately. */
    tryAcquire(now: number = Date.now()): boolean {
        this.evict(now)
        if (this.timestamps.length >= this.maxRequests) {
            return false
        }
        this.timestamps.push(now)
        return true
    }

    /** Waits until a slot is available, then records the acquire. */
    async waitForSlot(shouldContinue: () => boolean = () => true): Promise<void> {
        await this.gate
        let release!: () => void
        this.gate = new Promise<void>((resolve) => {
            release = resolve
        })

        try {
            while (true) {
                if (!shouldContinue()) {
                    throw new Error('Queue cleared')
                }

                const now = Date.now()
                this.evict(now)
                if (this.timestamps.length < this.maxRequests) {
                    this.timestamps.push(now)
                    return
                }

                const oldest = this.timestamps[0]
                if (oldest === undefined) {
                    await sleepInterruptible(1, shouldContinue)
                    continue
                }

                const waitMs = this.windowMs - (now - oldest) + 1
                await sleepInterruptible(Math.max(1, waitMs), shouldContinue)
            }
        } finally {
            release()
        }
    }

    /** Count of acquires currently inside the window (for tests/diagnostics). */
    activeCount(now: number = Date.now()): number {
        this.evict(now)
        return this.timestamps.length
    }

    private evict(now: number): void {
        const cutoff = now - this.windowMs
        while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
            this.timestamps.shift()
        }
    }
}

function sleepInterruptible(ms: number, shouldContinue: () => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now()
        let timer: ReturnType<typeof setTimeout> | undefined

        const tick = () => {
            if (!shouldContinue()) {
                if (timer) clearTimeout(timer)
                reject(new Error('Queue cleared'))
                return
            }
            const elapsed = Date.now() - start
            if (elapsed >= ms) {
                if (timer) clearTimeout(timer)
                resolve()
                return
            }
            timer = setTimeout(tick, Math.min(10, ms - elapsed))
        }
        tick()
    })
}

/** Resolve window max from explicit config, legacy RPS, or conservative default. */
export function resolveRateLimitMaxRequests(config: QueueConfig): number {
    const windowMs = config.rateLimitWindowMs ?? internalConfig.clientService.rateLimitWindowMs ?? 10_000
    const cap = internalConfig.clientService.rateLimitMaxRequestsCap ?? 100

    if (config.rateLimitMaxRequests != null) {
        return Math.min(config.rateLimitMaxRequests, cap)
    }

    const derived = Math.round(config.requestsPerSecond * (windowMs / 1000))
    if (config.requestsPerSecond !== runtimeDefaults.requestsPerSecond) {
        return Math.min(derived, cap)
    }

    return internalConfig.clientService.rateLimitMaxRequestsDefault ?? 80
}
