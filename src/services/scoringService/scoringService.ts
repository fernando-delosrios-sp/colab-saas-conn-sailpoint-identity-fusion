import { FusionAccount } from '../../model/account'
import { MatchingConfig, FusionConfig, effectiveSkipMatchIfMissing } from '../../model/config'
import { LogService } from '../logService'
import { FusionMatch, ScoreReport } from './types'
import { scoreDice, scoreDoubleMetaphone, scoreJaroWinkler, scoreLIG3, scoreNameMatcher } from './helpers'
import { isExactAttributeMatchScores } from './exactMatch'

/** Algorithm id for the synthetic combined score row (excluded from exact-match checks). */
export const WEIGHTED_MEAN_ALGORITHM = 'weighted-mean'

/**
 * How many identity comparisons to run before yielding to the event loop.
 * Large aggregations compare each managed account against every fusion identity; without yields,
 * the connector SDK can log multi-second "event loop blocked" warnings.
 */
const SCORING_IDENTITY_YIELD_INTERVAL = 100

/** Attribute label on the synthetic combined score row in reports and forms. */
export const COMBINED_SCORE_ROW_ATTRIBUTE = 'Combined score'

/**
 * Service for calculating and managing similarity scores for identity matching.
 * Handles score calculation, threshold checking, and score formatting.
 */
export class ScoringService {
    private readonly matchingConfigs: MatchingConfig[]
    private readonly fusionAverageScore: number
    private readonly fusionMergingExactMatch: boolean

    /**
     * @param config - Fusion configuration containing matching rules and score thresholds
     * @param log - Logger instance
     */
    constructor(
        config: FusionConfig,
        private log: LogService
    ) {
        this.matchingConfigs = config.matchingConfigs ?? []
        this.fusionAverageScore = config.fusionAverageScore ?? 0
        this.fusionMergingExactMatch = config.fusionMergingExactMatch ?? false
    }

    /**
     * Blend weight from a rule's minimum similarity (`fusionScore`). Zero or unset uses 1 to avoid divide-by-zero.
     */
    static blendWeight(fusionScore?: number): number {
        const t = fusionScore ?? 0
        return t <= 0 ? 1 : t
    }

    /**
     * Scores a fusion account against all existing fusion identities to find matches.
     * For each identity that meets the matching threshold, a {@link FusionMatch} is
     * added to the fusion account via {@link FusionAccount#addFusionMatch}.
     *
     * Yields periodically so heavy Match scoring does not block the Node event loop.
     *
     * @param fusionAccount - The account to score (typically a new/unmatched account)
     * @param fusionIdentities - The set of existing fusion identities to compare against
     */
    public async scoreFusionAccount(
        fusionAccount: FusionAccount,
        fusionIdentities: Iterable<FusionAccount>,
        candidateType: 'identity' | 'new-unmatched' = 'identity'
    ): Promise<number> {
        // No matching configs → no scoring possible; skip entirely to avoid
        // false positives (empty scores would otherwise mark every identity as a match).
        if (this.matchingConfigs.length === 0) return 0

        // When exact-match automatic assignment is enabled, there is no benefit in
        // continuing to score after a perfect match is found: the first exact match
        // wins and all subsequent comparisons would be discarded. Early exit here
        // avoids O(n) identity comparisons for every exact-match account.
        const earlyExitOnExactMatch = this.fusionMergingExactMatch && candidateType === 'identity'

        let compared = 0
        for (const fusionIdentity of fusionIdentities) {
            this.compareFusionAccounts(fusionAccount, fusionIdentity, candidateType)
            compared += 1
            if (earlyExitOnExactMatch) {
                const matches = fusionAccount.fusionMatches
                if (matches.length > 0 && isExactAttributeMatchScores(matches[matches.length - 1].scores)) {
                    break
                }
            }
            if (compared % SCORING_IDENTITY_YIELD_INTERVAL === 0) {
                await new Promise<void>((resolve) => setImmediate(resolve))
            }
        }
        return compared
    }

    /**
     * Compares two fusion accounts across all configured matching rules and records
     * a match if the weighted combined score and mandatory rules pass.
     *
     * @param fusionAccount - The candidate account being evaluated
     * @param fusionIdentity - The existing identity to compare against
     */
    private compareFusionAccounts(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        candidateType: 'identity' | 'new-unmatched'
    ): void {
        const scores: ScoreReport[] = []
        let hasFailedMandatory = false

        for (const matching of this.matchingConfigs) {
            const accountAttribute = fusionAccount.attributes[matching.attribute]
            const identityAttribute = fusionIdentity.attributes[matching.attribute]
            const skipForMissing = effectiveSkipMatchIfMissing(matching)
            const hasMissingValue =
                this.isMissingMatchValue(accountAttribute) || this.isMissingMatchValue(identityAttribute)

            if (skipForMissing && hasMissingValue) {
                scores.push({
                    ...matching,
                    skipped: true,
                    score: 0,
                    isMatch: false,
                    comment: 'Rule skipped (missing value on one or both sides)',
                })
                continue
            }

            const scoreReport: ScoreReport = this.scoreAttribute(
                (accountAttribute ?? '').toString(),
                (identityAttribute ?? '').toString(),
                matching
            )
            scores.push(scoreReport)
            if (matching.mandatory && !scoreReport.isMatch) {
                hasFailedMandatory = true
                // Push skipped entries for all remaining rules so the scores
                // array stays structurally complete for report rendering.
                for (const remaining of this.matchingConfigs.slice(this.matchingConfigs.indexOf(matching) + 1)) {
                    scores.push({
                        ...remaining,
                        skipped: true,
                        score: 0,
                        isMatch: false,
                        comment: 'Rule skipped (mandatory attribute failed)',
                    })
                }
                break
            }
        }

        let weightedSum = 0
        let weightTotal = 0
        for (const s of scores) {
            if (s.skipped) continue
            const w = ScoringService.blendWeight(s.fusionScore)
            weightedSum += w * s.score
            weightTotal += w
        }

        const combinedScore = weightTotal > 0 ? weightedSum / weightTotal : 0
        const hasContributing = weightTotal > 0
        const combinedPasses = hasContributing && combinedScore >= this.fusionAverageScore && !hasFailedMandatory

        if (weightTotal > 0) {
            for (const s of scores) {
                if (s.skipped) continue
                const w = ScoringService.blendWeight(s.fusionScore)
                s.weightedScore = Math.round((w / weightTotal) * s.score * 100) / 100
            }
        }

        const combinedReport: ScoreReport = {
            attribute: COMBINED_SCORE_ROW_ATTRIBUTE,
            algorithm: WEIGHTED_MEAN_ALGORITHM,
            fusionScore: this.fusionAverageScore,
            mandatory: true,
            score: Math.round(combinedScore * 100) / 100,
            isMatch: combinedPasses,
            comment: combinedPasses
                ? 'Combined score meets minimum threshold'
                : hasFailedMandatory
                  ? 'Combined score invalidated by failed mandatory attribute'
                  : !hasContributing
                    ? 'No rules contributed to combined score'
                    : 'Combined score is below minimum threshold',
        }
        scores.push(combinedReport)

        const identityId = fusionIdentity.identityId ?? ''
        const identityName = this.getIdentityDisplayLabel(fusionIdentity)
        const fusionMatch: FusionMatch = {
            fusionIdentity,
            identityId,
            identityName,
            candidateType,
            scores,
        }
        if (combinedPasses) {
            fusionAccount.addFusionMatch(fusionMatch)
        }
    }

    /**
     * Build a user-friendly label for report candidates.
     * Prefer displayName/name, then fall back to uid-like identifiers.
     */
    private getIdentityDisplayLabel(fusionIdentity: FusionAccount): string {
        const identityDisplayName = String(fusionIdentity.identityDisplayName ?? '').trim()
        if (identityDisplayName) return identityDisplayName

        const identityId = String(fusionIdentity.identityId ?? '').trim()
        if (identityId) return identityId

        const fallback = String(fusionIdentity.nativeIdentityOrUndefined ?? '').trim()
        return fallback || 'Unknown'
    }

    /**
     * Scores a single attribute pair using the algorithm specified in the matching config.
     *
     * Supported algorithms: name-matcher, jaro-winkler, dice, double-metaphone, lig3.
     *
     * @param accountAttribute - The attribute value from the candidate account
     * @param identityAttribute - The attribute value from the existing identity
     * @param matchingConfig - Configuration specifying the algorithm, threshold, and flags
     * @returns A score report with the similarity score and match determination
     */
    private scoreAttribute(
        accountAttribute: string,
        identityAttribute: string,
        matchingConfig: MatchingConfig
    ): ScoreReport {
        switch (matchingConfig.algorithm) {
            case 'name-matcher':
                return scoreNameMatcher(accountAttribute, identityAttribute, matchingConfig)
            case 'jaro-winkler':
                return scoreJaroWinkler(accountAttribute, identityAttribute, matchingConfig)
            case 'dice':
                return scoreDice(accountAttribute, identityAttribute, matchingConfig)
            case 'double-metaphone':
                return scoreDoubleMetaphone(accountAttribute, identityAttribute, matchingConfig)
            case 'lig3':
                return scoreLIG3(accountAttribute, identityAttribute, matchingConfig)
            case 'custom':
                this.log.crash('Custom algorithm not implemented')
        }
        return { ...matchingConfig, score: 0, isMatch: false }
    }

    /**
     * Match values are considered missing when null/undefined, or when their string
     * representation is empty after trimming whitespace.
     */
    private isMissingMatchValue(value: unknown): boolean {
        return value === null || value === undefined || String(value).trim().length === 0
    }
}
