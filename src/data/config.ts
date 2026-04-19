import { ConnectorError, ConnectorErrorType, readConfig, logger } from '@sailpoint/connector-sdk'
import { FusionConfig, SourceConfig } from '../model/config'
import { defaults, internalConfig, defaultFusionMaxCandidatesForForm } from './connectorDefaults'
import { assert, softAssert } from '../utils/assert'
import { readBoolean } from '../utils/safeRead'

export { defaults, internalConfig, defaultFusionMaxCandidatesForForm } from './connectorDefaults'

export const safeReadConfig = async (): Promise<FusionConfig> => {
    logger.debug('Reading connector configuration')
    const sourceConfig = await readConfig()
    assert(sourceConfig, 'Failed to read source configuration')

    const config = {
        ...sourceConfig,
        ...internalConfig,
    }

    assert(config.baseurl, 'Base URL is required in configuration')
    assert(config.clientId, 'Client ID is required in configuration')
    assert(config.clientSecret, 'Client secret is required in configuration')
    assert(config.spConnectorInstanceId, 'Connector instance ID is required in configuration')

    logger.debug('Configuration loaded, applying defaults')

    config.attributeMaps = config.attributeMaps ?? []
    config.normalAttributeDefinitions = config.normalAttributeDefinitions ?? []
    config.uniqueAttributeDefinitions = config.uniqueAttributeDefinitions ?? []
    config.sources = config.sources ?? []
    config.fusionFormAttributes = config.fusionFormAttributes ?? []
    config.matchingConfigs = config.matchingConfigs ?? []
    config.trim = config.trim ?? defaults.trim

    config.sources = config.sources
        .map((sourceConfig: SourceConfig) => {
            assert(sourceConfig, 'Source configuration is required')
            assert(sourceConfig.name, 'Source name is required')
            if (readBoolean(sourceConfig, 'forceAggregation', false) && !sourceConfig.aggregationMode) {
                sourceConfig.aggregationMode = 'before'
            }
            const taskResultWaitSeconds = sourceConfig.taskResultWait ?? defaults.taskResultWaitSeconds
            return {
                ...sourceConfig,
                enabled: sourceConfig.enabled ?? defaults.source.enabled,
                aggregationMode: sourceConfig.aggregationMode ?? defaults.source.aggregationMode,
                taskResultRetries: sourceConfig.taskResultRetries ?? defaults.source.taskResultRetries,
                taskResultWait: taskResultWaitSeconds * 1000,
                aggregationDelay: sourceConfig.aggregationDelay ?? defaults.source.aggregationDelay,
                optimizedAggregation: sourceConfig.optimizedAggregation ?? defaults.source.optimizedAggregation,
                accountFilter: sourceConfig.accountFilter ?? undefined,
                accountJmespathFilter: sourceConfig.accountJmespathFilter ?? undefined,
                correlationMode: sourceConfig.correlationMode ?? defaults.source.correlationMode,
                deferredMatching: sourceConfig.deferredMatching ?? defaults.source.deferredMatching,
            }
        })
        .filter((sourceConfig: SourceConfig) => sourceConfig.enabled)

    softAssert(config.sources.length > 0, 'No sources configured - no Match will be performed', 'warn')
    config.deleteEmpty = config.deleteEmpty ?? defaults.deleteEmpty
    config.forceAttributeRefresh = config.forceAttributeRefresh ?? defaults.forceAttributeRefresh
    config.skipAccountsWithMissingId = config.skipAccountsWithMissingId ?? defaults.skipAccountsWithMissingId
    config.maxHistoryMessages = config.maxHistoryMessages ?? defaults.maxHistoryMessages

    config.maxAttempts = config.maxAttempts ?? defaults.maxAttempts

    config.fusionFormExpirationDays = config.fusionFormExpirationDays ?? defaults.fusionFormExpirationDays
    config.fusionMergingExactMatch = config.fusionMergingExactMatch ?? defaults.fusionMergingExactMatch
    config.fusionAverageScore = config.fusionAverageScore ?? defaults.fusionAverageScore

    config.enableQueue = config.enableQueue ?? defaults.enableQueue
    config.enableRetry = config.enableRetry ?? defaults.enableRetry

    config.maxRetries = config.maxRetries ?? internalConfig.retriesConstant
    config.requestsPerSecond = config.requestsPerSecond ?? defaults.requestsPerSecond
    config.maxConcurrentRequests = config.maxConcurrentRequests ?? defaults.maxConcurrentRequests
    config.retryDelay = config.retryDelay ?? defaults.retryDelay
    config.pageSize = config.batchSize ?? internalConfig.pageSize
    config.enablePriority = config.enablePriority ?? defaults.enablePriority
    const processingWaitSeconds =
        config.processingWait !== undefined ? config.processingWait : internalConfig.processingWaitConstant / 1000
    config.processingWait = processingWaitSeconds * 1000

    config.reset = config.reset ?? defaults.reset
    config.managedAccountsBatchSize = config.managedAccountsBatchSize ?? defaults.managedAccountsBatchSize
    const rawMaxCandidates =
        config.fusionMaxCandidatesForForm !== undefined
            ? Number(config.fusionMaxCandidatesForForm)
            : defaultFusionMaxCandidatesForForm()
    assert(
        Number.isFinite(rawMaxCandidates) &&
            rawMaxCandidates >= internalConfig.fusionMaxCandidatesForFormMin &&
            rawMaxCandidates <= internalConfig.fusionMaxCandidatesForFormMax,
        `fusionMaxCandidatesForForm must be between ${internalConfig.fusionMaxCandidatesForFormMin} and ${internalConfig.fusionMaxCandidatesForFormMax}`
    )
    config.fusionMaxCandidatesForForm = Math.trunc(rawMaxCandidates)
    config.concurrencyCheckEnabled = config.concurrencyCheckEnabled ?? defaults.concurrencyCheckEnabled
    config.provisioningTimeout = config.provisioningTimeout ?? defaults.provisioningTimeout
    config.externalLoggingEnabled = config.externalLoggingEnabled ?? defaults.externalLoggingEnabled
    config.externalLoggingUrl = config.externalLoggingUrl ?? undefined
    config.externalLoggingLevel = config.externalLoggingLevel ?? defaults.externalLoggingLevel

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
        if (matchingConfig.algorithm === 'custom') {
            const expr = (matchingConfig.customVelocityExpression ?? '').trim()
            assert(
                expr.length > 0,
                `Custom matching algorithm requires a Velocity expression for attribute ${matchingConfig.attribute}`
            )
        }
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
