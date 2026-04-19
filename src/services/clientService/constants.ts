import { defaults, internalConfig } from '../../data/connectorDefaults'

/**
 * Default number of retry attempts for API requests (aligned with connector defaults)
 */
export const DEFAULT_RETRIES = internalConfig.retriesConstant

/**
 * Default requests per second for throttling (aligned with connector defaults)
 */
export const DEFAULT_REQUESTS_PER_SECOND = defaults.requestsPerSecond

/**
 * Base delay for exponential backoff (in milliseconds)
 */
export const BASE_RETRY_DELAY_MS = defaults.retryDelay

export const MAX_RETRY_DELAY_MS = internalConfig.maxRetryDelayMs
export const RETRY_JITTER_FACTOR = internalConfig.retryJitterFactor
export const RATE_LIMIT_JITTER_FACTOR = internalConfig.rateLimitJitterFactor
export const STATS_LOGGING_INTERVAL_MS = internalConfig.statsLoggingIntervalMs
export const MAX_STATS_SAMPLES = internalConfig.maxStatsSamples
export const QUEUE_PROCESSING_INTERVAL_MS = internalConfig.queueProcessingIntervalMs
export const SAILPOINT_LIST_MAX = internalConfig.sailPointListMax
