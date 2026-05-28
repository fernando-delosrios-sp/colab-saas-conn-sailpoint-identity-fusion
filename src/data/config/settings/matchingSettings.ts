/**
 * connector-spec.json -> Attribute Matching Settings -> Matching Settings
 */
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { assert, softAssert } from '../../../utils/assert'
import { extractBoolean } from '../../../utils/attributes'
import type { MatchingSettingsSection, MatchingConfig } from '../../../model/config'

export const connectorSpecInitialValues = {
    fusionAverageScore: 80,
    algorithm: 'name-matcher' as const,
    enablePriority: true,
} as const

export const runtimeDefaults = {
    fusionMergingExactMatch: false,
} as const

export function readSettings(raw: Record<string, unknown>): MatchingSettingsSection & { fusionScoreMap: Map<string, number> } {
    const matchingConfigs = (raw.matchingConfigs as MatchingConfig[]) ?? []
    const fusionMergingExactMatch = extractBoolean(raw, 'fusionMergingExactMatch') ?? runtimeDefaults.fusionMergingExactMatch
    const fusionAverageScore = (raw.fusionAverageScore as number | undefined) ?? connectorSpecInitialValues.fusionAverageScore

    assert(
        fusionAverageScore >= 0 && fusionAverageScore <= 100,
        'Minimum combined match score (fusionAverageScore) must be between 0 and 100'
    )

    softAssert(
        matchingConfigs.length > 0,
        'No matching configurations defined - fusion matching may not work correctly',
        'warn'
    )

    const fusionScoreMap = new Map<string, number>()
    for (const matchingConfig of matchingConfigs) {
        assert(matchingConfig.attribute, 'Matching config attribute is required')
        if (matchingConfig.fusionScore !== undefined) {
            assert(
                matchingConfig.fusionScore >= 0 && matchingConfig.fusionScore <= 100,
                `Fusion score for attribute ${matchingConfig.attribute} must be between 0 and 100`
            )
            fusionScoreMap.set(matchingConfig.attribute, matchingConfig.fusionScore)
        }
    }

    logger.debug(
        `Minimum combined match score: ${fusionAverageScore}; per-attribute thresholds mapped: ${fusionScoreMap.size}`
    )

    return {
        matchingConfigs,
        fusionMergingExactMatch,
        fusionAverageScore,
        fusionScoreMap,
    }
}