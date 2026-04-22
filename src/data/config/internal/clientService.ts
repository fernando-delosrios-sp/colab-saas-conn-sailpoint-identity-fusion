/** HTTP client, auth path, pagination caps, Bottleneck tuning — not in `connector-spec.json`. */
export const internalConfigClientService = {
    pageSize: 250,
    maxLimiterRetries: 5,
    baseRetryDelayMs: 1000,
    reservoirWindowMs: 10_000,
    reservoirAmount: 100,
    tokenUrlPath: '/oauth/token',
    processingWaitConstant: 60 * 1000,
    maxRetryDelayMs: 60000,
    retryJitterFactor: 0.3,
    rateLimitJitterFactor: 0.1,
    statsLoggingIntervalMs: 30000,
    maxStatsSamples: 1000,
    sailPointListMax: 250,
} as const
