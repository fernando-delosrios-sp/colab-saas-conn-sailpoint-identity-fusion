import { runtimeDefaults } from '../../data/config/defaults'
import { internalConfig } from '../../data/config/internal'

/**
 * Base delay for exponential backoff (in milliseconds)
 */
export const BASE_RETRY_DELAY_MS = 1000

export const DEFAULT_RETRIES: number = internalConfig.clientService.retriesConstant
export const DEFAULT_REQUESTS_PER_SECOND: number = runtimeDefaults.requestsPerSecond
export const MAX_RETRY_DELAY_MS: number = internalConfig.clientService.maxRetryDelayMs
export const RETRY_JITTER_FACTOR: number = internalConfig.clientService.retryJitterFactor
export const RATE_LIMIT_JITTER_FACTOR: number = internalConfig.clientService.rateLimitJitterFactor
