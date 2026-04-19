/**
 * Single source of truth: connector-spec `sourceConfigInitialValues`, runtime defaults,
 * and internal constants (merged into config by `safeReadConfig`).
 */

/** Same keys as `connector-spec.json` → `sourceConfigInitialValues` (sync script copies this into the spec). */
export const connectorSpecInitialValues = {
    fusionFormExpirationDays: 7,
    fusionAverageScore: 80,
    provisioningTimeout: 300,
    managedAccountsBatchSize: 100,
    fusionMaxCandidatesForForm: 3,
    includeIdentities: true,
    identityScopeQuery: '*',
    maxHistoryMessages: 10,
    attributeMerge: 'first' as const,
    enableQueue: true,
    enableRetry: true,
    maxRetries: 20,
    requestsPerSecond: 10,
    maxConcurrentRequests: 10,
    processingWait: 60,
    retryDelay: 1000,
    batchSize: 250,
    externalLoggingLevel: 'info' as const,
    proxyEnabled: false,
    proxyUrl: '',
    proxyPassword: '',
    maxAttempts: 20,
    digits: 1,
    counterStart: 1,
    case: 'same' as const,
    expression: '#set($initial = $firstname.substring(0, 1))$initial$lastname',
    useIncrementalCounter: false,
    refresh: false,
    trim: false,
    force: false,
    algorithm: 'name-matcher' as const,
    enablePriority: true,
    aggregationMode: 'none' as const,
    correlationMode: 'none' as const,
}

/** Defaults for new sources and for runtime when keys are absent. */
export const defaults = {
    ...connectorSpecInitialValues,
    /** Per-source aggregation task poll interval (seconds) when not set on the source */
    taskResultWaitSeconds: 60,
    /** Per-source defaults (not represented in sourceConfigInitialValues) */
    source: {
        enabled: true,
        aggregationMode: 'none' as const,
        taskResultRetries: 5,
        aggregationDelay: 5,
        optimizedAggregation: true,
        correlationMode: 'none' as const,
        deferredMatching: true,
    },
    deleteEmpty: false,
    forceAttributeRefresh: false,
    skipAccountsWithMissingId: false,
    fusionMergingExactMatch: false,
    reset: false,
    externalLoggingEnabled: false,
    concurrencyCheckEnabled: true,
} as const

/** Internal values merged into resolved configuration (not settable via connector UI). */
export const internalConfig = {
    requestsPerSecondConstant: 100,
    pageSize: 250,
    tokenUrlPath: '/oauth/token',
    processingWaitConstant: 60 * 1000,
    retriesConstant: 20,
    workflowName: 'Fusion Email Sender',
    delayedAggregationWorkflowName: 'Fusion Delayed Aggregation',
    padding: '   ',
    msDay: 86400000,
    identityNotFoundWait: 5000,
    identityNotFoundRetries: 5,
    separator: ' | ',
    fusionFormNamePattern: 'Fusion Review',
    nonAggregableTypes: ['DelimitedFile'],
    concurrency: {
        uncorrelatedAccounts: 500,
        processAccounts: 50,
        correlateAccounts: 25,
    },
    fusionAccountRefreshThresholdInSeconds: 60,

    /** Minimum configurable match candidates on a single fusion review form. */
    fusionMaxCandidatesForFormMin: 1,
    /** Maximum configurable match candidates on a single fusion review form (platform/UI limit). */
    fusionMaxCandidatesForFormMax: 15,
    /** Maximum retry delay cap (milliseconds). */
    maxRetryDelayMs: 60000,
    /** Jitter factor for exponential retry delays (fraction of exponential delay). */
    retryJitterFactor: 0.3,
    /** Jitter factor for 429 retry-after delays (fraction of base delay). */
    rateLimitJitterFactor: 0.1,
    /** Stats logging interval (milliseconds). */
    statsLoggingIntervalMs: 30000,
    /** Rolling stats sample window size. */
    maxStatsSamples: 1000,
    /** Queue processing poll interval (milliseconds). */
    queueProcessingIntervalMs: 10,
    /** SailPoint list endpoint hard cap (items per request). */
    sailPointListMax: 250,
} as const

/** Default for `fusionMaxCandidatesForForm` when absent from resolved runtime config. */
export function defaultFusionMaxCandidatesForForm(): number {
    return defaults.fusionMaxCandidatesForForm
}
