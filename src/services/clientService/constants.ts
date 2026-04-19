import { defaults, internalConfig } from '../../data/connectorDefaults'
import {
    MAX_RETRY_DELAY_MS,
    MAX_STATS_SAMPLES,
    QUEUE_PROCESSING_INTERVAL_MS,
    RATE_LIMIT_JITTER_FACTOR,
    RETRY_JITTER_FACTOR,
    STATS_LOGGING_INTERVAL_MS,
} from '../../data/connectorConstants'

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

export {
    MAX_RETRY_DELAY_MS,
    MAX_STATS_SAMPLES,
    QUEUE_PROCESSING_INTERVAL_MS,
    RATE_LIMIT_JITTER_FACTOR,
    RETRY_JITTER_FACTOR,
    STATS_LOGGING_INTERVAL_MS,
}
