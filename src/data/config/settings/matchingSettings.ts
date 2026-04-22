/**
 * connector-spec.json -> Attribute Matching Settings -> Matching Settings
 */
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { assert, softAssert } from '../../../utils/assert'
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    fusionAverageScore: 80,
    algorithm: 'name-matcher' as const,
} as const

export const runtimeDefaults = {
    fusionMergingExactMatch: false,
} as const

export function applySettings(config: FusionConfigBuild): void {
    config.matchingConfigs = config.matchingConfigs ?? []

    config.fusionMergingExactMatch = config.fusionMergingExactMatch ?? runtimeDefaults.fusionMergingExactMatch
    config.fusionAverageScore = config.fusionAverageScore ?? connectorSpecInitialValues.fusionAverageScore

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
}
