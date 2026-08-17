import type { FusionConfig } from '../../model/config'
import { FusionRun } from '../../model/fusionRun'
import type { SourceInfo } from '../sourceService'

/** True when the managed source has at least one reviewer in the current run. */
export function sourceHasReviewers(sourceInfo: SourceInfo | undefined, run: FusionRun): boolean {
    if (!sourceInfo?.id) return false
    const reviewers = run.reviewersBySourceId.get(sourceInfo.id)
    return !!reviewers && reviewers.size > 0
}

type MatchScoringConfig = Pick<FusionConfig, 'fusionEnableAutoMerge' | 'fusionEnableManualReview'>

/** Score when automatic merge is on, or manual review is on with reviewers configured. */
export function sourceShouldEnterMatchScoring(
    config: MatchScoringConfig,
    sourceInfo: SourceInfo | undefined,
    run: FusionRun
): boolean {
    if (config.fusionEnableAutoMerge) return true
    if (config.fusionEnableManualReview !== false && sourceHasReviewers(sourceInfo, run)) return true
    return false
}

type ManualReviewConfig = Pick<FusionConfig, 'fusionEnableManualReview'>

/** Manual review forms are available only when manual review is enabled and reviewers exist. */
export function sourceManualReviewPathAvailable(
    config: ManualReviewConfig,
    sourceInfo: SourceInfo | undefined,
    run: FusionRun
): boolean {
    return config.fusionEnableManualReview !== false && sourceHasReviewers(sourceInfo, run)
}
