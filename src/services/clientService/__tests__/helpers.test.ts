import { createRetriesConfig, shouldRetry, calculateRetryDelay } from '../helpers'
import {
    BASE_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS,
    RATE_LIMIT_JITTER_FACTOR,
    RETRY_JITTER_FACTOR,
} from '../constants'
import axiosRetry from 'axios-retry'
import type { Mock } from 'vitest'

vi.mock('axios-retry', () => {
    const isNetworkError = vi.fn((err: any) => err?.isNetworkError === true)
    const isRetryableError = vi.fn((err: any) => err?.isRetryable === true)
    return {
        isNetworkError,
        isRetryableError,
        default: { isNetworkError, isRetryableError },
    }
})

describe('clientService helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('createRetriesConfig', () => {
        it('should return config with default retries', () => {
            const config = createRetriesConfig()
            expect(config.retries).toBeDefined()
            expect(config.retryDelay).toBeInstanceOf(Function)
            expect(config.retryCondition).toBeInstanceOf(Function)
        })

        it('should use custom retries when provided', () => {
            const config = createRetriesConfig(5)
            expect(config.retries).toBe(5)
        })

        it('should reuse shouldRetry for retryCondition', () => {
            const config = createRetriesConfig()
            expect(config.retryCondition).toBe(shouldRetry)
        })

        it('should reuse calculateRetryDelay for retryDelay', () => {
            const config = createRetriesConfig()
            expect(config.retryDelay).toBe(calculateRetryDelay)
        })

        it('should retry on 429', () => {
            const config = createRetriesConfig()
            const error = { response: { status: 429 } }
            expect(config.retryCondition!(error as any)).toBe(true)
        })

        it('should retry on 5xx', () => {
            const config = createRetriesConfig()
            expect(config.retryCondition!({ response: { status: 500 } } as any)).toBe(true)
            expect(config.retryCondition!({ response: { status: 503 } } as any)).toBe(true)
        })
    })

    describe('shouldRetry', () => {
        it('should return true for 429', () => {
            expect(shouldRetry({ response: { status: 429 } })).toBe(true)
        })

        it('should return true for 5xx', () => {
            expect(shouldRetry({ response: { status: 500 } })).toBe(true)
            expect(shouldRetry({ response: { status: 502 } })).toBe(true)
        })

        it('should return true for network errors', () => {
            ;(axiosRetry.isNetworkError as Mock).mockReturnValue(true)
            expect(shouldRetry({ isNetworkError: true })).toBe(true)
        })

        it('should return true for timeout', () => {
            expect(shouldRetry({ code: 'ECONNABORTED' })).toBe(true)
            expect(shouldRetry({ code: 'ETIMEDOUT' })).toBe(true)
        })

        it('should return false for 4xx (except 429)', () => {
            ;(axiosRetry.isNetworkError as Mock).mockReturnValue(false)
            ;(axiosRetry.isRetryableError as Mock).mockReturnValue(false)
            expect(shouldRetry({ response: { status: 400 } })).toBe(false)
            expect(shouldRetry({ response: { status: 404 } })).toBe(false)
        })

        it('should return false for null/undefined', () => {
            expect(shouldRetry(null)).toBe(false)
            expect(shouldRetry(undefined)).toBe(false)
        })
    })

    describe('calculateRetryDelay', () => {
        it('should return positive delay for retry count', () => {
            const delay = calculateRetryDelay(1, { response: { status: 500 } })
            expect(delay).toBeGreaterThan(0)
        })

        it('should use standard exponential backoff starting at base delay', () => {
            const delay1 = calculateRetryDelay(1, { response: { status: 500 } })
            expect(delay1).toBeGreaterThanOrEqual(BASE_RETRY_DELAY_MS)
            expect(delay1).toBeLessThanOrEqual(BASE_RETRY_DELAY_MS * (1 + RETRY_JITTER_FACTOR))

            const delay2 = calculateRetryDelay(2, { response: { status: 500 } })
            expect(delay2).toBeGreaterThanOrEqual(BASE_RETRY_DELAY_MS * 2)
            expect(delay2).toBeLessThanOrEqual(BASE_RETRY_DELAY_MS * 2 * (1 + RETRY_JITTER_FACTOR))
        })

        it('should cap exponential backoff at MAX_RETRY_DELAY_MS', () => {
            const delay = calculateRetryDelay(10, { response: { status: 500 } })
            expect(delay).toBe(MAX_RETRY_DELAY_MS)
        })

        it('should use retry-after integer with jitter for 429', () => {
            const delay = calculateRetryDelay(0, {
                response: { status: 429, headers: { 'retry-after': '5' } },
            })
            expect(delay).toBeGreaterThanOrEqual(5000)
            expect(delay).toBeLessThanOrEqual(5000 * (1 + RATE_LIMIT_JITTER_FACTOR))
        })

        it('should use retry-after HTTP-date with jitter for 429', () => {
            const now = 1750000000000
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)
            try {
                const future = new Date(now + 5000).toUTCString()
                const delay = calculateRetryDelay(0, {
                    response: { status: 429, headers: { 'retry-after': future } },
                })
                expect(delay).toBeGreaterThanOrEqual(5000)
                expect(delay).toBeLessThanOrEqual(5000 * (1 + RATE_LIMIT_JITTER_FACTOR))
            } finally {
                nowSpy.mockRestore()
            }
        })

        it('should fall back to exponential backoff for invalid retry-after', () => {
            const delay = calculateRetryDelay(1, {
                response: { status: 429, headers: { 'retry-after': 'not-a-number' } },
            })
            expect(delay).toBeGreaterThanOrEqual(BASE_RETRY_DELAY_MS)
            expect(delay).toBeLessThanOrEqual(BASE_RETRY_DELAY_MS * (1 + RETRY_JITTER_FACTOR))
        })

        it('should fall back to exponential backoff for negative retry-after', () => {
            const delay = calculateRetryDelay(1, {
                response: { status: 429, headers: { 'retry-after': '-5' } },
            })
            expect(delay).toBeGreaterThanOrEqual(BASE_RETRY_DELAY_MS)
            expect(delay).toBeLessThanOrEqual(BASE_RETRY_DELAY_MS * (1 + RETRY_JITTER_FACTOR))
        })
    })
})
