import { AsyncLocalStorage } from 'node:async_hooks'
import { IAxiosRetryConfig } from 'axios-retry'
import { logger } from '@sailpoint/connector-sdk'
import axiosRetry from 'axios-retry'
import {
    BASE_RETRY_DELAY_MS,
    DEFAULT_RETRIES,
    MAX_RETRY_DELAY_MS,
    RATE_LIMIT_JITTER_FACTOR,
    RETRY_JITTER_FACTOR,
} from './constants'

/**
 * Creates an axios retry configuration from the provided parameters
 * @param retries - Maximum number of retry attempts (defaults to connector default maxRetries)
 * @returns IAxiosRetryConfig configuration object
 */
export function createRetriesConfig(retries?: number): IAxiosRetryConfig {
    return {
        retries: retries ?? DEFAULT_RETRIES,
        retryDelay: calculateRetryDelay,
        retryCondition: shouldRetry,
        onRetry: (retryCount, error, requestConfig) => {
            const url = requestConfig.url || 'unknown'
            const status = error?.response?.status || error?.code || 'unknown'
            logger.debug(
                `Retrying API [${url}] due to error [${status}]. Retry number [${retryCount}/${retries ?? DEFAULT_RETRIES}]`
            )

            // Only log error details at debug level to avoid spam
            if (logger.level === 'debug') {
                logger.debug(`Error details: ${error.message || error}`)
            }
        },
    }
}

/**
 * Determine if an error should trigger a retry
 */
export function shouldRetry(error: unknown): boolean {
    if (!error) return false
    const err = error as { response?: { status?: number }; code?: string }

    // Network errors
    if (axiosRetry.isNetworkError(error as any) || axiosRetry.isRetryableError(error as any)) {
        return true
    }

    // Rate limiting
    if (err.response?.status === 429) return true

    // Server errors (5xx)
    const status = err.response?.status
    if (status !== undefined && status >= 500 && status < 600) return true

    // Timeout errors
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true

    return false
}

/**
 * True when a page fetch failed because the gateway gave up or the request timed out.
 * HTTP 504 and `ECONNABORTED` / `ETIMEDOUT` count; HTTP 429 and other 5xx do not.
 */
export function isGatewayFailure(error: unknown): boolean {
    if (!error) return false
    const err = error as { response?: { status?: number }; code?: string }
    if (err.response?.status === 504) return true
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true
    return false
}

const IMF_FIXDATE_REGEX = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/

/**
 * Parse a Retry-After header value into milliseconds.
 * Accepts integer seconds or an IMF-fixdate HTTP-date.
 * Returns undefined for invalid or unsupported values.
 */
function parseRetryAfter(value: string, nowMs: number): number | undefined {
    const trimmed = value.trim()
    if (trimmed === '') return undefined

    // Non-negative integer seconds
    if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10) * 1000
    }

    // Strict IMF-fixdate: Day, DD Mon YYYY HH:MM:SS GMT
    if (IMF_FIXDATE_REGEX.test(trimmed)) {
        const dateMs = Date.parse(trimmed)
        if (!isNaN(dateMs)) {
            return Math.max(0, dateMs - nowMs)
        }
    }

    return undefined
}

/**
 * Calculate retry delay with exponential backoff and respect for retry-after headers.
 * For 429 responses, uses the retry-after header with jitter.
 * For other retryable errors, uses exponential backoff with a sensible base delay.
 */
export function calculateRetryDelay(retryCount: number, error: unknown): number {
    const err = error as { response?: { status?: number; headers?: Record<string, string> } }
    // If 429, check for retry-after header and add jitter
    if (err.response?.status === 429) {
        const retryAfter = err.response.headers?.['retry-after']
        if (retryAfter) {
            const delay = parseRetryAfter(retryAfter, Date.now())
            if (delay !== undefined) {
                const jitter = Math.random() * RATE_LIMIT_JITTER_FACTOR * delay
                return delay + jitter
            }
        }
    }

    // Exponential backoff for other retryable errors: baseDelay * 2^(retryCount-1), with jitter
    const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount - 1)
    const jitter = Math.random() * RETRY_JITTER_FACTOR * exponentialDelay
    return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS)
}

const requestAbortSignalStorage = new AsyncLocalStorage<AbortSignal | undefined>()

/** AbortSignal for the in-flight queued HTTP request (read by SdkApiAdapter axios interceptor). */
export function getRequestAbortSignal(): AbortSignal | undefined {
    return requestAbortSignalStorage.getStore()
}

/** Run fn with the given abort signal visible to outbound axios requests. */
export function runWithRequestAbortSignal<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    if (!signal) return fn()
    return requestAbortSignalStorage.run(signal, fn)
}

/** Combine multiple abort signals; aborts when any input signal aborts. */
export function mergeAbortSignals(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
    const active = signals.filter((signal): signal is AbortSignal => signal != null)
    if (active.length === 0) return undefined
    if (active.length === 1) return active[0]
    return AbortSignal.any(active)
}

/** Run fn and reject when signal aborts (propagates abort to caller promise). */
export function invokeAbortable<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return fn()
    if (signal.aborted) {
        return Promise.reject(signal.reason ?? new Error('Aborted'))
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason ?? new Error('Aborted'))
        signal.addEventListener('abort', onAbort, { once: true })
        fn()
            .then((value) => {
                signal.removeEventListener('abort', onAbort)
                resolve(value)
            })
            .catch((error) => {
                signal.removeEventListener('abort', onAbort)
                reject(error)
            })
    })
}

