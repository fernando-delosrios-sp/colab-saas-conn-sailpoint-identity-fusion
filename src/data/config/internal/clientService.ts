/** HTTP client, auth path, pagination caps, queue stats — not in `connector-spec.json`. */
export const internalConfigClientService = {
    rateLimitWindowMs: 10_000,
    rateLimitMaxRequestsDefault: 80,
    rateLimitMaxRequestsCap: 100,
    requestsPerSecondConstant: 100,
    pageSize: 250,
    tokenUrlPath: '/oauth/token',
    /** Default and platform-maximum keep-alive interval (ms). ISC rejects values above 180s. */
    processingWaitConstant: 180 * 1000,
    retriesConstant: 20,
    /** Consecutive gateway-failure page outcomes before the pagination circuit sheds. */
    consecutiveGatewayFailures: 3,
    /** Bounded wait after shed before a single probe (ms). */
    paginationCooldownMs: 30_000,
    /** Extra attempts for a paginated page on gateway failure (maxRetries 1 ⇒ one retry). */
    paginationGatewayMaxRetries: 1,
    /** Cooldowns allowed on one pagination stream before a later streak aborts. */
    maxCooldownsPerStream: 1,
    maxRetryDelayMs: 60000,
    retryJitterFactor: 0.3,
    rateLimitJitterFactor: 0.1,
    maxStatsSamples: 1000,
    queueProcessingIntervalMs: 10,
    sailPointListMax: 250,
} as const


