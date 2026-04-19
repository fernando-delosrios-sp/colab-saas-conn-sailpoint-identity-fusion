import connectorSpecInitialValues from './connectorSpecInitialValues.json'

/** Defaults for new sources and for runtime when keys are absent (aligned with connector-spec initial values). */
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
} as const

/** Default for `fusionMaxCandidatesForForm` when absent from resolved runtime config. */
export function defaultFusionMaxCandidatesForForm(): number {
    return defaults.fusionMaxCandidatesForForm
}
