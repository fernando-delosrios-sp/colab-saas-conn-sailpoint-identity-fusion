/**
 * Connector-wide constants (queue tuning, SailPoint API limits, form UI bounds).
 * Runtime behaviour that depends on resolved configuration uses `defaults` / `internalConfig` in `./config`.
 */

/** Minimum configurable match candidates shown on a single fusion review form. */
export const FUSION_MAX_CANDIDATES_FOR_FORM_MIN = 1
/** Maximum configurable match candidates shown on a single fusion review form (platform/UI limit). */
export const FUSION_MAX_CANDIDATES_FOR_FORM_MAX = 15

/** Maximum retry delay cap (in milliseconds) */
export const MAX_RETRY_DELAY_MS = 60000

/** Jitter factor for exponential retry delays (30% of exponential delay) */
export const RETRY_JITTER_FACTOR = 0.3

/** Jitter factor for 429 retry-after header delays (10% of base delay) */
export const RATE_LIMIT_JITTER_FACTOR = 0.1

/** Interval for stats logging (in milliseconds) */
export const STATS_LOGGING_INTERVAL_MS = 30000

/** Maximum number of samples to keep for statistics */
export const MAX_STATS_SAMPLES = 1000

/** Queue processing check interval (in milliseconds) */
export const QUEUE_PROCESSING_INTERVAL_MS = 10

/** SailPoint list endpoint hard cap (items per request) */
export const SAILPOINT_LIST_MAX = 250
