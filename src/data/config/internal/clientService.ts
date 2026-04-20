/** HTTP client, auth path, pagination caps, queue stats — not in `connector-spec.json`. */
export const internalConfigClientService = {
    requestsPerSecondConstant: 100,
    pageSize: 250,
    tokenUrlPath: '/oauth/token',
    processingWaitConstant: 60 * 1000,
    retriesConstant: 20,
    maxRetryDelayMs: 60000,
    retryJitterFactor: 0.3,
    rateLimitJitterFactor: 0.1,
    statsLoggingIntervalMs: 30000,
    maxStatsSamples: 1000,
    queueProcessingIntervalMs: 10,
    sailPointListMax: 250,
} as const
