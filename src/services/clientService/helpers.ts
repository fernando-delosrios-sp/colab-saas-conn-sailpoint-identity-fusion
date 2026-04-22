import { IAxiosRetryConfig } from 'axios-retry'
import { logger } from '@sailpoint/connector-sdk'
import axiosRetry from 'axios-retry'
import { BASE_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS, RATE_LIMIT_JITTER_FACTOR, RETRY_JITTER_FACTOR } from './constants'

/**
 * Creates an axios retry configuration from the provided parameters
 * @param retries - Maximum number of retry attempts (defaults to connector default maxRetries)
 * @returns IAxiosRetryConfig configuration object
 */
export function createRetriesConfig(retries?: number): IAxiosRetryConfig {
    return {
        retries: retries ?? 0,
        retryDelay: (retryCount, error) => {
            // Handle 429 rate limiting with retry-after header
            if (error?.response?.status === 429) {
                const retryAfter = error.response.headers?.['retry-after']
                if (retryAfter) {
                    const delay = parseInt(retryAfter, 10)
                    if (!isNaN(delay)) {
                        return delay * 1000 // Convert to milliseconds
                    }
                }
            }

            // Exponential backoff with jitter for other retryable errors
            const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount)
            const jitter = Math.random() * RETRY_JITTER_FACTOR * exponentialDelay
            return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS)
        },
        retryCondition: (error) => {
            if (!error) return false

            // Network errors
            if (axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error)) {
                return true
            }

            // Rate limiting (429)
            if (error.response?.status === 429) {
                return true
            }

            // Server errors (5xx)
            const status = error.response?.status
            if (status && status >= 500 && status < 600) {
                return true
            }

            // Timeout errors
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                return true
            }

            return false
        },
        onRetry: (retryCount, error, requestConfig) => {
            const url = requestConfig.url || 'unknown'
            const status = error?.response?.status || error?.code || 'unknown'
            logger.debug(
                `Retrying API [${url}] due to error [${status}]. Retry number [${retryCount}/${retries ?? 0}]`
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
            const delay = parseInt(retryAfter, 10)
            if (!isNaN(delay)) {
                const baseDelay = delay * 1000 // Convert to milliseconds
                // Add jitter to prevent thundering herd
                const jitter = Math.random() * RATE_LIMIT_JITTER_FACTOR * baseDelay
                return baseDelay + jitter
            }
        }
    }

    // Exponential backoff for other retryable errors: baseDelay * 2^(retryCount-1), with jitter
    const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount - 1)
    const jitter = Math.random() * RETRY_JITTER_FACTOR * exponentialDelay
    return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS)
}
