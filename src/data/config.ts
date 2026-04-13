import { ConnectorError, ConnectorErrorType, readConfig, logger } from '@sailpoint/connector-sdk'
import { FusionConfig, SourceConfig } from '../model/config'
import {
    FUSION_MAX_CANDIDATES_FOR_FORM_DEFAULT,
    FUSION_MAX_CANDIDATES_FOR_FORM_MAX,
    FUSION_MAX_CANDIDATES_FOR_FORM_MIN,
} from '../services/formService/constants'
import { assert, softAssert } from '../utils/assert'
import { readBoolean } from '../utils/safeRead'

const internalConfig = {
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
}

// NOTE: Don't add defaults from connector-spec.json here. Instead, add them to the connector-spec.json file.
export const safeReadConfig = async (): Promise<FusionConfig> => {
    logger.debug('Reading connector configuration')
    const sourceConfig = await readConfig()
    assert(sourceConfig, 'Failed to read source configuration')

    const config = {
        ...sourceConfig,
        ...internalConfig, // Internal constants always take precedence
    }

    // Validate required connection settings
    assert(config.baseurl, 'Base URL is required in configuration')
    assert(config.clientId, 'Client ID is required in configuration')
    assert(config.clientSecret, 'Client secret is required in configuration')
    assert(config.spConnectorInstanceId, 'Connector instance ID is required in configuration')

    logger.debug('Configuration loaded, applying defaults')

    // ============================================================================
    // Array defaults - ensure arrays are never undefined
    // ============================================================================
    config.attributeMaps = config.attributeMaps ?? []
    config.normalAttributeDefinitions = config.normalAttributeDefinitions ?? []
    config.uniqueAttributeDefinitions = config.uniqueAttributeDefinitions ?? []
    config.sources = config.sources ?? []
    config.fusionFormAttributes = config.fusionFormAttributes ?? []
    config.matchingConfigs = config.matchingConfigs ?? []
    config.trim = config.trim ?? false

    // ============================================================================
    // Source Settings defaults
    // ============================================================================
    // Set defaults for each source configuration
    config.sources = config.sources
        .map((sourceConfig: SourceConfig) => {
            assert(sourceConfig, 'Source configuration is required')
            assert(sourceConfig.name, 'Source name is required')
            // Backward compatibility: migrate forceAggregation to aggregationMode
            if (readBoolean(sourceConfig, 'forceAggregation', false) && !sourceConfig.aggregationMode) {
                sourceConfig.aggregationMode = 'before'
            }
            // taskResultWait is configured in seconds in connector-spec.json; convert to milliseconds for internal use
            const taskResultWaitSeconds = sourceConfig.taskResultWait ?? 60
            return {
                ...sourceConfig,
                enabled: sourceConfig.enabled ?? true,
                aggregationMode: sourceConfig.aggregationMode ?? 'none',
                taskResultRetries: sourceConfig.taskResultRetries ?? 5,
                taskResultWait: taskResultWaitSeconds * 1000,
                aggregationDelay: sourceConfig.aggregationDelay ?? 5,
                optimizedAggregation: sourceConfig.optimizedAggregation ?? true,
                accountFilter: sourceConfig.accountFilter ?? undefined,
                accountJmespathFilter: sourceConfig.accountJmespathFilter ?? undefined,
                correlationMode: sourceConfig.correlationMode ?? 'none',
                deferredMatching: sourceConfig.deferredMatching ?? true,
            }
        })
        .filter((sourceConfig: SourceConfig) => sourceConfig.enabled)

    softAssert(config.sources.length > 0, 'No sources configured - no Match will be performed', 'warn')
    config.deleteEmpty = config.deleteEmpty ?? false
    config.forceAttributeRefresh = config.forceAttributeRefresh ?? false
    config.skipAccountsWithMissingId = config.skipAccountsWithMissingId ?? false
    config.maxHistoryMessages = config.maxHistoryMessages ?? 10

    // ============================================================================
    // Attribute Definition Settings defaults
    // ============================================================================
    config.maxAttempts = config.maxAttempts ?? 100

    // ============================================================================
    // Attribute Matching Settings defaults
    // ============================================================================
    // Default from connector-spec.json: fusionExpirationDays: 7
    config.fusionFormExpirationDays = config.fusionFormExpirationDays ?? 7
    config.fusionMergingExactMatch = config.fusionMergingExactMatch ?? false
    // Minimum weighted combined match score (0-100); default aligned with connector-spec
    config.fusionAverageScore = config.fusionAverageScore ?? 80

    // ============================================================================
    // Advanced Connection Settings defaults
    // ============================================================================
    config.enableQueue = config.enableQueue ?? false
    config.enableRetry = config.enableRetry ?? false

    // Defaults from connector-spec.json: maxRetries: 20, requestsPerSecond: 10, maxConcurrentRequests: 10
    config.maxRetries = config.maxRetries ?? internalConfig.retriesConstant
    config.requestsPerSecond = config.requestsPerSecond ?? 10
    config.maxConcurrentRequests = config.maxConcurrentRequests ?? 10
    // retryDelay is configured in milliseconds in connector-spec.json
    config.retryDelay = config.retryDelay ?? 1000 // 1 second base delay (only used as fallback, 429 responses use retry-after header)
    config.pageSize = config.batchSize ?? 250 // Paging size is 250 for all calls
    config.enableBatching = config.enableBatching ?? false
    config.enablePriority = config.enablePriority ?? true
    // processingWait is configured in seconds in connector-spec.json; convert to milliseconds for internal use
    const processingWaitSeconds =
        config.processingWait !== undefined ? config.processingWait : internalConfig.processingWaitConstant / 1000
    config.processingWait = processingWaitSeconds * 1000

    // ============================================================================
    // Developer Settings defaults
    // ============================================================================
    config.reset = config.reset ?? false
    config.managedAccountsBatchSize = config.managedAccountsBatchSize ?? 50
    const rawMaxCandidates =
        config.fusionMaxCandidatesForForm !== undefined
            ? Number(config.fusionMaxCandidatesForForm)
            : FUSION_MAX_CANDIDATES_FOR_FORM_DEFAULT
    assert(
        Number.isFinite(rawMaxCandidates) &&
            rawMaxCandidates >= FUSION_MAX_CANDIDATES_FOR_FORM_MIN &&
            rawMaxCandidates <= FUSION_MAX_CANDIDATES_FOR_FORM_MAX,
        `fusionMaxCandidatesForForm must be between ${FUSION_MAX_CANDIDATES_FOR_FORM_MIN} and ${FUSION_MAX_CANDIDATES_FOR_FORM_MAX}`
    )
    config.fusionMaxCandidatesForForm = Math.trunc(rawMaxCandidates)
    config.concurrencyCheckEnabled = config.concurrencyCheckEnabled ?? true
    // Default from connector-spec.json: provisioningTimeout: 300
    config.provisioningTimeout = config.provisioningTimeout ?? 300
    config.externalLoggingEnabled = config.externalLoggingEnabled ?? false
    config.externalLoggingUrl = config.externalLoggingUrl ?? undefined
    // Default to 'info' level for external logging if enabled but level not specified
    config.externalLoggingLevel = config.externalLoggingLevel ?? 'info'

    assert(
        config.fusionAverageScore >= 0 && config.fusionAverageScore <= 100,
        'Minimum combined match score (fusionAverageScore) must be between 0 and 100'
    )

    softAssert(
        config.matchingConfigs.length > 0,
        'No matching configurations defined - fusion matching may not work correctly',
        'warn'
    )

    config.fusionScoreMap = new Map<string, number>()
    for (const matchingConfig of config.matchingConfigs) {
        assert(matchingConfig.attribute, 'Matching config attribute is required')
        if (matchingConfig.fusionScore !== undefined) {
            assert(
                matchingConfig.fusionScore >= 0 && matchingConfig.fusionScore <= 100,
                `Fusion score for attribute ${matchingConfig.attribute} must be between 0 and 100`
            )
            config.fusionScoreMap.set(matchingConfig.attribute, matchingConfig.fusionScore)
        }
    }

    config.getScore = (attribute?: string): number => {
        assert(attribute, 'Attribute is required to get fusion score')
        const score = config.fusionScoreMap!.get(attribute)
        if (score === undefined) {
            throw new ConnectorError(
                `Fusion score not found for attribute: ${attribute}`,
                ConnectorErrorType.NotFound
            )
        }
        return score
    }
    logger.debug(
        `Minimum combined match score: ${config.fusionAverageScore}; per-attribute thresholds mapped: ${config.fusionScoreMap.size}`
    )

    // Validate external logging configuration if enabled
    if (config.externalLoggingEnabled) {
        assert(config.externalLoggingUrl, 'External logging URL is required when external logging is enabled')
        assert(
            ['error', 'warn', 'info', 'debug'].includes(config.externalLoggingLevel || ''),
            'External logging level must be one of: error, warn, info, debug'
        )
    }

    logger.info('Configuration validation completed successfully')
    return config
}
