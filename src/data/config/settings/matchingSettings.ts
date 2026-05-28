/**
 * connector-spec.json -> Attribute Matching Settings -> Matching Settings
 */
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { assert, softAssert } from '../../../utils/assert'
import { extractBoolean } from '../../../utils/attributes'
import { migrateConfigKey } from '../migration'
import type { MatchingSettingsSection, MatchingConfig } from '../../../model/config'

export const connectorSpecInitialValues = {
    fusionManualReviewScore: 80,
    algorithm: 'name-matcher' as const,
    enablePriority: true,
} as const

export const runtimeDefaults = {
    fusionEnableAutoAssignment: false,
} as const

export function readSettings(raw: Record<string, unknown>): MatchingSettingsSection & { fusionScoreMap: Map<string, number> } {
    migrateConfigKey(raw, 'fusionAverageScore', 'fusionManualReviewScore')
    migrateConfigKey(raw, 'fusionMergingExactMatch', 'fusionEnableAutoAssignment')

    const matchingConfigs = (raw.matchingConfigs as MatchingConfig[]) ?? []
    const fusionEnableAutoAssignment = extractBoolean(raw, 'fusionEnableAutoAssignment') ?? runtimeDefaults.fusionEnableAutoAssignment
    const fusionManualReviewScore = (raw.fusionManualReviewScore as number | undefined) ?? connectorSpecInitialValues.fusionManualReviewScore
    let fusionAutoAssignmentScore = raw.fusionAutoAssignmentScore as number | undefined

    assert(
        fusionManualReviewScore >= 0 && fusionManualReviewScore <= 100,
        'Minimum score for manual review (fusionManualReviewScore) must be between 0 and 100'
    )

    if (fusionAutoAssignmentScore !== undefined) {
        assert(
            fusionAutoAssignmentScore >= 0 && fusionAutoAssignmentScore <= 100,
            'Automatic assignment match score (fusionAutoAssignmentScore) must be between 0 and 100'
        )
    }

    if (fusionEnableAutoAssignment) {
        if (fusionAutoAssignmentScore === undefined) {
            fusionAutoAssignmentScore = 100
        }
        assert(
            fusionAutoAssignmentScore >= fusionManualReviewScore,
            'Automatic assignment match score (fusionAutoAssignmentScore) must be greater than or equal to the minimum score for manual review (fusionManualReviewScore)'
        )
    }

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

    logger.info(
        `Minimum score for manual review: ${fusionManualReviewScore}; per-attribute thresholds mapped: ${fusionScoreMap.size}`
    )

    return {
        matchingConfigs,
        fusionEnableAutoAssignment,
        fusionManualReviewScore,
        fusionAutoAssignmentScore,
        fusionScoreMap,
    }
}