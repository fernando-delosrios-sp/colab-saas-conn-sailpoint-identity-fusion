import { runtimeDefaults, internalConfig } from '../../data/config'

/**
 * Default number of retry attempts for API requests (aligned with connector defaults)
 */
export const DEFAULT_RETRIES = internalConfig.clientService.retriesConstant

/**
 * Default requests per second for throttling (aligned with connector defaults)
 */
export const DEFAULT_REQUESTS_PER_SECOND = runtimeDefaults.requestsPerSecond

/**
 * Base delay for exponential backoff (in milliseconds)
 */
export const BASE_RETRY_DELAY_MS = 1000

export const MAX_RETRY_DELAY_MS = internalConfig.clientService.maxRetryDelayMs
export const RETRY_JITTER_FACTOR = internalConfig.clientService.retryJitterFactor
export const RATE_LIMIT_JITTER_FACTOR = internalConfig.clientService.rateLimitJitterFactor
