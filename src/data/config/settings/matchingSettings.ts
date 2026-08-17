/**
 * connector-spec.json -> Attribute Matching Settings -> Matching Settings
 */
import { bootstrapLog } from '../../../services/logService'
import { assert, softAssert } from './assertLite'
import { extractBoolean } from '../../../utils/attributes'
import { migrateConfigKey } from '../migration'
import type { MatchingSettingsSection, MatchingConfig } from '../../../model/config'

export const connectorSpecInitialValues = {
    fusionManualReviewScore: 80,
    algorithm: 'name-matcher' as const,
    enablePriority: true,
} as const

export const runtimeDefaults = {
    fusionEnableAutoMerge: false,
    fusionEnableManualReview: true,
    fusionManualReviewScore: connectorSpecInitialValues.fusionManualReviewScore,
} as const

export function readSettings(raw: Record<string, unknown>): MatchingSettingsSection & { fusionScoreMap: Map<string, number> } {
    migrateConfigKey(raw, 'fusionAverageScore', 'fusionManualReviewScore')
    migrateConfigKey(raw, 'fusionMergingExactMatch', 'fusionEnableAutoMerge')
    migrateConfigKey(raw, 'fusionEnableAutoAssignment', 'fusionEnableAutoMerge')
    migrateConfigKey(raw, 'fusionAutoAssignmentScore', 'fusionAutoMergeScore')

    const matchingConfigs = (raw.matchingConfigs as MatchingConfig[]) ?? []
    const fusionEnableAutoMerge = extractBoolean(raw, 'fusionEnableAutoMerge') ?? runtimeDefaults.fusionEnableAutoMerge
    const fusionEnableManualReview =
        extractBoolean(raw, 'fusionEnableManualReview') ?? runtimeDefaults.fusionEnableManualReview
    const fusionManualReviewScore = (raw.fusionManualReviewScore as number | undefined) ?? runtimeDefaults.fusionManualReviewScore
    const fusionAutoMergeScore = raw.fusionAutoMergeScore as number | undefined

    assert(
        fusionManualReviewScore >= 0 && fusionManualReviewScore <= 100,
        'Minimum score for manual review (fusionManualReviewScore) must be between 0 and 100'
    )

    if (fusionAutoMergeScore !== undefined) {
        assert(
            fusionAutoMergeScore >= 0 && fusionAutoMergeScore <= 100,
            'Automatic merge match score (fusionAutoMergeScore) must be between 0 and 100'
        )
    }

    if (fusionEnableAutoMerge) {
        assert(
            fusionAutoMergeScore !== undefined,
            'Automatic merge match score (fusionAutoMergeScore) is required when automatic merge is enabled'
        )
        assert(
            fusionAutoMergeScore! > fusionManualReviewScore,
            'Automatic merge match score (fusionAutoMergeScore) must be strictly greater than the minimum score for manual review (fusionManualReviewScore)'
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

    bootstrapLog.detail({
        manualReviewScore: fusionManualReviewScore,
        thresholdCount: fusionScoreMap.size,
    })

    return {
        matchingConfigs,
        fusionEnableAutoMerge,
        fusionEnableManualReview,
        fusionManualReviewScore,
        fusionAutoMergeScore,
        fusionScoreMap,
    }
}
