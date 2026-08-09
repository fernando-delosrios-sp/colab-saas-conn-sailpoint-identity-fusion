export interface ScenarioConfig {
    sources?: Array<Record<string, unknown>>
    uniqueAttributeDefinitions?: Array<Record<string, unknown>>
    normalAttributeDefinitions?: Array<Record<string, unknown>>
    attributeMaps?: Array<Record<string, unknown>>
    matchingConfigs?: Array<Record<string, unknown>>
    fusionManualReviewScore?: number
    fusionEnableAutoMerge?: boolean
    fusionOwnerIsGlobalReviewer?: boolean
    fusionFormExpirationDays?: number
    includeIdentities?: boolean
    deleteEmpty?: boolean
    skipAccountsWithMissingId?: boolean
    maxHistoryMessages?: number
    reset?: boolean
    resetAccounts?: boolean
    resetForms?: boolean
    forceAttributeRefresh?: boolean
    [key: string]: unknown
}

/** Removes end-of-session runtime fields persisted into recorded scenario config. */
export function sanitizeScenarioConfigForReplay(config: ScenarioConfig): ScenarioConfig {
    const clean = { ...config }
    delete clean.batchCumulativeCount
    delete clean.acctAggregationStart
    delete clean.acctAggregationEnd
    delete clean.cloudCacheUpdate
    return clean
}

