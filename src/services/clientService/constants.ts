import { internalConfig } from '../../data/config'

/**
 * Base delay for exponential backoff (in milliseconds) — internal default for limiter/axios retry math.
 */
export const BASE_RETRY_DELAY_MS = internalConfig.clientService.baseRetryDelayMs

export const MAX_RETRY_DELAY_MS = internalConfig.clientService.maxRetryDelayMs
export const RETRY_JITTER_FACTOR = internalConfig.clientService.retryJitterFactor
export const RATE_LIMIT_JITTER_FACTOR = internalConfig.clientService.rateLimitJitterFactor
export const STATS_LOGGING_INTERVAL_MS = internalConfig.clientService.statsLoggingIntervalMs
export const MAX_STATS_SAMPLES = internalConfig.clientService.maxStatsSamples
export const SAILPOINT_LIST_MAX = internalConfig.clientService.sailPointListMax
