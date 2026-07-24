import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlidingWindowRateLimiter, resolveRateLimitMaxRequests } from '../rateLimiter'
import { QueueConfig } from '../types'
import { runtimeDefaults } from '../../../data/config/settings/advancedConnectionSettings'

describe('SlidingWindowRateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('allows burst up to max within window', () => {
        const limiter = new SlidingWindowRateLimiter(10_000, 80)

        for (let i = 0; i < 80; i++) {
            expect(limiter.tryAcquire(1_000)).toBe(true)
        }
        expect(limiter.tryAcquire(1_000)).toBe(false)
        expect(limiter.activeCount(1_000)).toBe(80)
    })

    it('81st acquire waits until oldest timestamp exits the window', async () => {
        const limiter = new SlidingWindowRateLimiter(10_000, 80)
        vi.setSystemTime(1_000)

        for (let i = 0; i < 80; i++) {
            expect(limiter.tryAcquire()).toBe(true)
        }

        const waitPromise = limiter.waitForSlot()
        await vi.advanceTimersByTimeAsync(9_999)
        expect(limiter.activeCount()).toBe(80)

        await vi.advanceTimersByTimeAsync(2)
        await waitPromise
        expect(limiter.activeCount()).toBe(1)
    })

    it('evicts timestamps outside the sliding window', () => {
        const limiter = new SlidingWindowRateLimiter(10_000, 80)

        expect(limiter.tryAcquire(0)).toBe(true)
        expect(limiter.tryAcquire(10_001)).toBe(true)
        expect(limiter.activeCount(10_001)).toBe(1)
    })
})

describe('resolveRateLimitMaxRequests', () => {
    const base: QueueConfig = {
        requestsPerSecond: runtimeDefaults.requestsPerSecond,
        maxConcurrentRequests: 20,
        maxRetries: 3,
        enablePriority: true,
    }

    it('uses conservative default for factory requestsPerSecond', () => {
        expect(resolveRateLimitMaxRequests(base)).toBe(80)
    })

    it('derives window max from legacy requestsPerSecond when customized', () => {
        expect(resolveRateLimitMaxRequests({ ...base, requestsPerSecond: 6 })).toBe(60)
    })
})
