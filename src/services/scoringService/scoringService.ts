import { FusionAccount } from '../../model/account'
import { MatchingConfig, FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { FusionMatch, ScoreReport } from './types'
import { scoreDice, scoreDoubleMetaphone, scoreJaroWinkler, scoreLIG3, scoreNameMatcher } from './helpers'

/**
 * Service for calculating and managing similarity scores for identity matching.
 * Handles score calculation, threshold checking, and score formatting.
 */
export class ScoringService {
    private readonly matchingConfigs: MatchingConfig[]
    private readonly fusionUseAverageScore: boolean
    private readonly fusionAverageScore: number
    private reportMode: boolean = false

    /**
     * @param config - Fusion configuration containing matching rules and score thresholds
     * @param log - Logger instance
     */
    constructor(
        config: FusionConfig,
        private log: LogService
    ) {
        this.matchingConfigs = config.matchingConfigs ?? []
        this.fusionUseAverageScore = config.fusionUseAverageScore ?? false
        this.fusionAverageScore = config.fusionAverageScore ?? 0
    }

    /**
     * Enables report mode, which forces full evaluation of all matching rules
     * even when early termination would normally occur (e.g. a mandatory rule fails).
     * Used when generating fusion reports that need complete score breakdowns.
     */
    public enableReportMode(): void {
        this.reportMode = true
    }

    /**
     * Scores a fusion account against all existing fusion identities to find matches.
     * For each identity that meets the matching threshold, a {@link FusionMatch} is
     * added to the fusion account via {@link FusionAccount#addFusionMatch}.
     *
     * @param fusionAccount - The account to score (typically a new/unmatched account)
     * @param fusionIdentities - The set of existing fusion identities to compare against
     */
    public scoreFusionAccount(
        fusionAccount: FusionAccount,
        fusionIdentities: Iterable<FusionAccount>,
        candidateType: 'identity' | 'new-unmatched' = 'identity'
    ): void {
        // No matching configs → no scoring possible; skip entirely to avoid
        // false positives (empty scores would otherwise mark every identity as a match).
        if (this.matchingConfigs.length === 0) return

        // Use for...of instead of forEach for better performance in hot path
        for (const fusionIdentity of fusionIdentities) {
            this.compareFusionAccounts(fusionAccount, fusionIdentity, candidateType)
        }
    }

    /**
     * Compares two fusion accounts across all configured matching rules and records
     * a match if thresholds are met. Supports both individual-attribute matching
     * and average-score matching modes.
     *
     * In non-report mode without average scoring, evaluation short-circuits on
     * the first failed mandatory rule for performance.
     *
     * @param fusionAccount - The candidate account being evaluated
     * @param fusionIdentity - The existing identity to compare against
     */
    private compareFusionAccounts(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        candidateType: 'identity' | 'new-unmatched'
    ): void {
        const fullRun = this.reportMode || this.fusionUseAverageScore
        const scores: ScoreReport[] = []
        let isMatch = false
        let hasFailedMandatory = false

        for (const matching of this.matchingConfigs) {
            const accountAttribute = fusionAccount.attributes[matching.attribute]
            const identityAttribute = fusionIdentity.attributes[matching.attribute]
            const skipMatchIfMissing = matching.skipMatchIfMissing ?? true
            const hasMissingValue =
                this.isMissingMatchValue(accountAttribute) || this.isMissingMatchValue(identityAttribute)

            if (skipMatchIfMissing && hasMissingValue) {
                continue
            }

            if (!hasMissingValue || matching.mandatory || !skipMatchIfMissing) {
                const scoreReport: ScoreReport = this.scoreAttribute(
                    (accountAttribute ?? '').toString(),
                    (identityAttribute ?? '').toString(),
                    matching
                )
                if (!scoreReport.isMatch && matching.mandatory && !fullRun) {
                    return
                }
                if (matching.mandatory && !scoreReport.isMatch) {
                    hasFailedMandatory = true
                }
                isMatch = isMatch || scoreReport.isMatch
                scores.push(scoreReport)
            }
        }

        if (this.fusionUseAverageScore) {
            const hasScoredAttributes = scores.length > 0
            const score = hasScoredAttributes ? scores.reduce((acc, score) => acc + score.score, 0) / scores.length : 0
            const match = hasScoredAttributes && score >= this.fusionAverageScore && !hasFailedMandatory

            const scoreReport: ScoreReport = {
                attribute: 'Average Score',
                algorithm: 'average',
                fusionScore: this.fusionAverageScore,
                mandatory: true,
                score,
                isMatch: match,
                comment: match
                    ? 'Average score is above threshold'
                    : hasFailedMandatory
                    ? 'Average score invalidated by failed mandatory attribute'
                    : 'Average score is below threshold',
            }
            scores.push(scoreReport)
            isMatch = match
        } else {
            if (scores.length === 0) {
                isMatch = false
            } else {
                let hasMandatory = false
                let allScoresMatch = true
                for (const score of scores) {
                    if (score.mandatory) {
                        hasMandatory = true
                    }
                    if (!score.isMatch) {
                        allScoresMatch = false
                    }
                    if (score.mandatory && !score.isMatch) {
                        hasFailedMandatory = true
                        break
                    }
                }
                if (hasFailedMandatory) {
                    isMatch = false
                } else if (hasMandatory) {
                    isMatch = true
                } else if (allScoresMatch) {
                    isMatch = true
                }
            }
        }

        const identityId = fusionIdentity.identityId ?? ''
        const identityName = this.getIdentityDisplayLabel(fusionIdentity)
        const fusionMatch: FusionMatch = {
            fusionIdentity,
            identityId,
            identityName,
            candidateType,
            scores,
        }
        if (isMatch) {
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
