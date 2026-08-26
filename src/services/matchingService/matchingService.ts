import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { assert } from '../../utils/assert'
import {
    MatchingConfig,
    FusionConfig,
    effectiveSkipMatchIfMissing,
    effectiveSkipMatchIfThresholdNotMet,
} from '../../model/config'
import { resolveFusionMaxCandidatesForForm } from '../../data/config'
import { compareMatchesForForm } from './matchingHelpers'
import { FusionMatch, MatchCandidateType, RuleScoreNumeric, ScoreReport } from './types'
import {
    makeScoreReport,
    normalizeLIG3,
    lig3UpperBound,
    lig3UpperBoundSkipIfUnreachable,
    scoreBinary,
    scoreBinaryNumeric,
    scoreCustomVelocity,
    scoreCustomVelocityNumeric,
    scoreDice,
    scoreDiceNumeric,
    scoreDoubleMetaphone,
    scoreDoubleMetaphoneNumeric,
    scoreJaroWinkler,
    scoreJaroWinklerNumeric,
    scoreLIG3,
    scoreLIG3Normalized,
    scoreLIG3NormalizedNumeric,
    scoreNameMatcher,
    scoreNameMatcherNumeric,
    scoreNameMatcherNormalized,
    scoreNameMatcherNormalizedNumeric,
} from './scoringHelpers'
import { normalizeName as normalizeNameForMatcher } from './nameMatching'
import {
    buildExactValueIndex,
    buildLig3LengthIndex,
    compactIdsToIdentities,
    intersectCompactIds,
    queryExactValueIndex,
    queryLig3LengthIndex,
    type CompactIdentityId,
} from './blockingIndexes'
import { normalizeCompositeManagedAccountKey } from '../../model/managedAccountKey'
import { LogService } from '../logService'
import { FusionRun } from '../../model/fusionRun'

import { missing, trimStr } from '../../utils/safeRead'

/** Build a skipped ScoreReport without spreading the full MatchingConfig. */
function makeSkippedReport(matching: MatchingConfig, comment: string): ScoreReport {
    return {
        attribute: matching.attribute,
        algorithm: matching.algorithm,
        fusionScore: matching.fusionScore,
        mandatory: matching.mandatory,
        skipMatchIfMissing: matching.skipMatchIfMissing,
        skipMatchIfThresholdNotMet: matching.skipMatchIfThresholdNotMet,
        score: 0,
        isMatch: false,
        skipped: true,
        comment,
    }
}

const MISSING_SKIP_COMMENT = 'Rule skipped (missing value on one or both sides)'
const LIG3_BOUND_SKIP_COMMENT = 'Length ratio upper bound below threshold'
const BELOW_THRESHOLD_SKIP_COMMENT = 'Rule skipped (score below threshold)'

function skipCommentForNumeric(numeric: RuleScoreNumeric): string | undefined {
    if (numeric.skipReason === 'missing') return MISSING_SKIP_COMMENT
    if (numeric.skipReason === 'lig3-bound') return LIG3_BOUND_SKIP_COMMENT
    if (numeric.skipReason === 'below-threshold') return BELOW_THRESHOLD_SKIP_COMMENT
    return numeric.comment
}

/**
 * Rebuild the full ScoreReport[] (per-rule rows + combined row) from numeric totals
 * without re-invoking scorers. Used after an identity fast-path pass.
 */
function materializeScoreReportsFromNumeric(
    ruleResults: readonly RuleScoreNumeric[],
    matchingConfigs: MatchingConfig[],
    fusionManualReviewScore: number
): ScoreReport[] {
    const scores: ScoreReport[] = []
    let weightedSum = 0
    let weightTotal = 0
    let hasFailedMandatory = false

    for (let i = 0; i < matchingConfigs.length; i++) {
        const matching = matchingConfigs[i]
        const numeric = ruleResults[i]
        const comment = skipCommentForNumeric(numeric)
        scores.push(
            makeScoreReport(matching, numeric.score, numeric.isMatch, comment, numeric.skipped ? true : undefined)
        )
        if (!numeric.skipped) {
            const w = MatchingService.blendWeight(matching.fusionScore)
            weightedSum += w * numeric.score
            weightTotal += w
        }
        if (matching.mandatory && !numeric.skipped && !numeric.isMatch) {
            hasFailedMandatory = true
        }
    }

    if (weightTotal > 0) {
        for (const s of scores) {
            if (s.skipped) continue
            const w = MatchingService.blendWeight(s.fusionScore)
            s.weightedScore = Math.round((w / weightTotal) * s.score * 100) / 100
        }
    }

    const { combinedScore, hasContributing, combinedPasses } = evaluateCombinedScoreOutcome(
        weightedSum,
        weightTotal,
        fusionManualReviewScore,
        hasFailedMandatory
    )
    scores.push({
        attribute: COMBINED_SCORE_ROW_ATTRIBUTE,
        algorithm: WEIGHTED_MEAN_ALGORITHM,
        fusionScore: fusionManualReviewScore,
        mandatory: true,
        score: Math.round(combinedScore * 100) / 100,
        isMatch: combinedPasses,
        comment: combinedScoreComment(combinedPasses, hasFailedMandatory, hasContributing),
    })
    return scores
}

const MANDATORY_FAIL_SKIP_COMMENT = 'Rule skipped (mandatory attribute failed)'
const THRESHOLD_SKIP_COMMENT = 'Rule skipped (combined score cannot reach threshold)'

function appendSkippedRemainingRules(
    scores: ScoreReport[],
    startIndex: number,
    matchingConfigs: MatchingConfig[],
    comment: string
): void {
    for (let r = startIndex; r < matchingConfigs.length; r++) {
        scores.push(makeSkippedReport(matchingConfigs[r], comment))
    }
}

function evaluateCombinedScoreOutcome(
    weightedSum: number,
    weightTotal: number,
    manualReviewScore: number,
    hasFailedMandatory: boolean
): { combinedScore: number; hasContributing: boolean; combinedPasses: boolean } {
    const combinedScore = weightTotal > 0 ? weightedSum / weightTotal : 0
    const hasContributing = weightTotal > 0
    const combinedPasses = hasContributing && combinedScore >= manualReviewScore && !hasFailedMandatory
    return { combinedScore, hasContributing, combinedPasses }
}

function combinedScoreComment(combinedPasses: boolean, hasFailedMandatory: boolean, hasContributing: boolean): string {
    if (combinedPasses) return 'Combined score meets minimum threshold'
    if (hasFailedMandatory) return 'Combined score invalidated by failed mandatory attribute'
    if (!hasContributing) return 'No rules contributed to combined score'
    return 'Combined score is below minimum threshold'
}

/** Algorithm id for the synthetic combined score row (excluded from exact-match checks). */
const WEIGHTED_MEAN_ALGORITHM = 'weighted-mean'

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
export class MatchingService {
    private readonly matchingConfigs: MatchingConfig[]
    private readonly fusionManualReviewScore: number
    private readonly fusionMaxIdentityMatchCandidates: number
    private readonly fusionScoreMap: Map<string, number>
    /** Reused per identity comparison so pass reconstruction does not allocate a new array each time. */
    private readonly ruleNumericScratch: RuleScoreNumeric[] = []

    /**
     * @param config - Fusion configuration containing matching rules and score thresholds
     * @param log - Logger instance
     * @param run - Per-run state container for candidate-blocking indexes and normalization caches
     */
    constructor(
        config: FusionConfig,
        _log: LogService,
        private run?: FusionRun
    ) {
        this.matchingConfigs = config.matchingConfigs ?? []
        this.fusionManualReviewScore = config.fusionManualReviewScore ?? 0
        this.fusionMaxIdentityMatchCandidates = resolveFusionMaxCandidatesForForm(config.fusionMaxCandidatesForForm)
        this.fusionScoreMap = config.fusionScoreMap ?? new Map()
    }

    /**
     * Blend weight from a rule's minimum similarity (`fusionScore`). Zero or unset uses 1 to avoid divide-by-zero.
     */
    static blendWeight(fusionScore?: number): number {
        const t = fusionScore ?? 0
        return t <= 0 ? 1 : t
    }

    /**
     * Retrieves the configured fusion score threshold for a specific attribute.
     * Throws an error if the attribute is not configured in the matching rules.
     */
    getScore(attribute?: string): number {
        assert(attribute, 'Attribute is required to get fusion score')
        const score = this.fusionScoreMap.get(attribute)
        if (score === undefined) {
            throw new ConnectorError(`Fusion score not found for attribute: ${attribute}`, ConnectorErrorType.NotFound)
        }
        return score
    }

    /**
     * Return the LIG3-normalized form of `rawValue` for `account`, computing and caching on first access.
     * Cache is keyed by (FusionAccount, attributeName) so each (identity, attribute) pair is normalized once
     * regardless of how many managed accounts are scored against it.
     */
    private getNormalized(account: FusionAccount, attrName: string, rawValue: string): string {
        if (!this.run) return normalizeLIG3(rawValue)
        let byAttr = this.run.normalizedCache.get(account)
        if (!byAttr) {
            byAttr = new Map()
            this.run.normalizedCache.set(account, byAttr)
        }
        let cached = byAttr.get(attrName)
        if (cached === undefined) {
            cached = normalizeLIG3(rawValue)
            byAttr.set(attrName, cached)
        }
        return cached
    }

    /** Return the name-normalized form of `rawValue` for `account`, computing and caching on first access. */
    private getNameNormalized(account: FusionAccount, attrName: string, rawValue: string): string {
        if (!this.run) return normalizeNameForMatcher(rawValue)
        let byAttr = this.run.nameNormalizedCache.get(account)
        if (!byAttr) {
            byAttr = new Map()
            this.run.nameNormalizedCache.set(account, byAttr)
        }
        let cached = byAttr.get(attrName)
        if (cached === undefined) {
            cached = normalizeNameForMatcher(rawValue)
            byAttr.set(attrName, cached)
        }
        return cached
    }

    /**
     * Best-case weighted combined score if all rules from `fromIndex` onward
     * contributed at raw score 100 (same weights as {@link blendWeight}).
     * Safe upper bound for early non-match: actual combined can only be lower when
     * some rules are skipped or score below 100.
     */
    private static maxAchievableCombinedScore(
        weightedSumSoFar: number,
        weightTotalSoFar: number,
        fromIndex: number,
        configs: MatchingConfig[]
    ): number {
        let wRem = 0
        for (let j = fromIndex; j < configs.length; j++) {
            wRem += MatchingService.blendWeight(configs[j].fusionScore)
        }
        const denom = weightTotalSoFar + wRem
        if (denom <= 0) return 0
        return (weightedSumSoFar + 100 * wRem) / denom
    }

    /**
     * Build all identity-side candidate-blocking indexes on FusionRun.
     *
     * The historical method name remains the sole public scoring-preparation entry point. Only mandatory
     * positive-threshold rules with recall-safe blockers contribute: Binary exact values and LIG3 length bounds.
     * Algorithms without a proven blocker do not filter candidates.
     *
     * @param identities - All Fusion identities to index
     */
    public buildTrigramIndex(identities: Iterable<FusionAccount>): void {
        if (!this.run) return
        this.run.trigramIndexByAttribute.clear()
        this.run.binaryIndexByAttribute.clear()
        this.run.lig3LengthIndexByAttribute.clear()
        this.run.blockingIdentityRoster = []
        this.run.indexedMandatoryAttributes = []
        this.run.trigramIndexBuilt = false

        const indexableMandatory = this.matchingConfigs.filter(
            (config) =>
                config.mandatory === true &&
                (config.fusionScore ?? 0) > 0 &&
                (config.algorithm === 'binary' || config.algorithm === 'lig3')
        )
        if (indexableMandatory.length === 0) return

        const identityArray = Array.from(identities)
        this.run.blockingIdentityRoster = identityArray
        for (const config of indexableMandatory) {
            if (config.algorithm === 'binary') {
                this.run.binaryIndexByAttribute.set(
                    config.attribute,
                    buildExactValueIndex(identityArray, config.attribute)
                )
            } else {
                this.run.lig3LengthIndexByAttribute.set(
                    config.attribute,
                    buildLig3LengthIndex(identityArray, config.attribute)
                )
            }
            if (!this.run.indexedMandatoryAttributes.includes(config.attribute)) {
                this.run.indexedMandatoryAttributes.push(config.attribute)
            }
        }
        this.run.trigramIndexBuilt = true
    }

    /**
     * Return the intersection of recall-safe per-rule candidate sets.
     *
     * Returns an empty Set when every indexable mandatory attribute is missing. Returns `undefined` and increments
     * `fullScanFallbackCount` when no recall-safe blocker can filter, requiring the caller to score the baseline.
     *
     * The returned Set already has `excludeIds` applied, so the caller can iterate it directly.
     *
     * @param account - The managed account being scored
     * @param log - Optional logger; when provided, throttled warnings are emitted on mandatory-missing block
     * @param excludeIds - Identity IDs to exclude from the candidate set (e.g. auto-assigned identities)
     */
    public getCandidates(
        account: FusionAccount,
        log?: LogService,
        excludeIds?: ReadonlySet<string>
    ): Set<FusionAccount> | undefined {
        if (!this.run) return undefined
        if (!this.run.trigramIndexBuilt || this.run.indexedMandatoryAttributes.length === 0) {
            this.run.fullScanFallbackCount += 1
            return undefined
        }

        let compactResult: Set<CompactIdentityId> | undefined

        const blockingRules = this.matchingConfigs.filter(
            (config) =>
                config.mandatory === true &&
                (config.fusionScore ?? 0) > 0 &&
                (config.algorithm === 'binary' || config.algorithm === 'lig3')
        )
        for (const config of blockingRules) {
            const raw = account.attributes[config.attribute]
            if (missing(raw)) {
                continue
            }
            let ruleCandidates: CompactIdentityId[]
            if (config.algorithm === 'binary') {
                const index = this.run.binaryIndexByAttribute.get(config.attribute)
                ruleCandidates = index ? queryExactValueIndex(index, String(raw)) : []
            } else {
                const index = this.run.lig3LengthIndexByAttribute.get(config.attribute)
                ruleCandidates = index ? queryLig3LengthIndex(index, String(raw), config.fusionScore ?? 0) : []
            }
            compactResult =
                compactResult === undefined
                    ? new Set(ruleCandidates)
                    : intersectCompactIds(compactResult, ruleCandidates)
        }

        if (compactResult === undefined) {
            this.run.mandatoryMissingBlockCount += 1
            const blockCount = this.run.mandatoryMissingBlockCount
            if (log && (blockCount <= 5 || blockCount % 100 === 0)) {
                log.warn(
                    `Mandatory missing block #${blockCount}: account has no value for any indexed mandatory attribute — zero identity candidates`
                )
            }
            return new Set()
        }

        const resultSet = compactIdsToIdentities(compactResult, this.run.blockingIdentityRoster)
        if (excludeIds && excludeIds.size > 0) {
            for (const identity of resultSet) {
                if (identity.identityId && excludeIds.has(identity.identityId)) {
                    resultSet.delete(identity)
                }
            }
        }

        return resultSet
    }

    /**
     * Scores a Fusion account against the supplied candidate pool.
     * Identity scoring compares the whole pool, then retains the highest-ranked K identity matches.
     * Deferred scoring remains uncapped.
     *
     * Yields periodically so heavy Match scoring does not block the Node event loop.
     *
     * @param fusionAccount - The account to score (typically a provisional Fusion account)
     * @param fusionIdentities - The set of existing fusion identities to compare against
     * @param maxIdentityMatches - Identity-origin retention cap applied after scoring the whole pool.
     *   Deferred scoring is uncapped.
     */
    public async scoreFusionAccount(
        fusionAccount: FusionAccount,
        fusionIdentities: Iterable<FusionAccount>,
        candidateType: MatchCandidateType = MatchCandidateType.Identity,
        maxIdentityMatches?: number
    ): Promise<number> {
        // No matching configs → no scoring possible; skip entirely to avoid
        // false positives (empty scores would otherwise mark every identity as a match).
        if (this.matchingConfigs.length === 0) return 0

        const maxIdentity =
            candidateType === MatchCandidateType.Identity
                ? (maxIdentityMatches ?? this.fusionMaxIdentityMatchCandidates)
                : undefined

        const useFullBreakdown = candidateType !== MatchCandidateType.Identity

        let compared = 0
        // Counter-based yielding avoids modulo on every iteration; reset after each yield.
        let yieldCounter = 0
        for (const fusionIdentity of fusionIdentities) {
            if (
                candidateType === MatchCandidateType.Deferred &&
                this.isSameDeferredCandidate(fusionAccount, fusionIdentity)
            ) {
                continue
            }
            this.compareFusionAccounts(fusionAccount, fusionIdentity, candidateType, useFullBreakdown)
            compared += 1
            yieldCounter += 1
            if (yieldCounter >= SCORING_IDENTITY_YIELD_INTERVAL) {
                yieldCounter = 0
                await new Promise<void>((resolve) => setImmediate(resolve))
            }
        }
        if (candidateType === MatchCandidateType.Identity) {
            if (this.run) {
                this.run.identityComparisonCount += compared
            }
            const identityMatches: FusionMatch[] = []
            const otherMatches: FusionMatch[] = []
            for (const match of fusionAccount.fusionMatchesRaw) {
                if ((match.candidateType ?? MatchCandidateType.Identity) === MatchCandidateType.Identity) {
                    identityMatches.push(match)
                } else {
                    otherMatches.push(match)
                }
            }
            identityMatches.sort(compareMatchesForForm)
            fusionAccount.layers.replaceFusionMatches([...otherMatches, ...identityMatches.slice(0, maxIdentity)])
        }
        return compared
    }

    /**
     * Deferred candidate matching compares a managed account against current-run non-matched deferred candidates.
     * Guard against accidental self-comparison to prevent a perfect self-match.
     */
    private isSameDeferredCandidate(fusionAccount: FusionAccount, fusionIdentity: FusionAccount): boolean {
        if (fusionAccount === fusionIdentity) return true

        const managedAccountId = fusionAccount.managedAccountId
        if (!managedAccountId) {
            return fusionAccount.managedKeyOrUndefined === fusionIdentity.managedKeyOrUndefined
        }

        return this.identityMatchesManagedAccountKey(fusionIdentity, managedAccountId)
    }

    /**
     * Check whether a fusion identity matches a managed account key by comparing against
     * all known identity key variants (managedAccountId, managedKey, originAccountId, accountIdsSet, missingAccountIdsSet).
     */
    private identityMatchesManagedAccountKey(fusionIdentity: FusionAccount, managedAccountId: string): boolean {
        const candidates = [
            fusionIdentity.managedAccountId,
            fusionIdentity.managedKeyOrUndefined,
            fusionIdentity.originAccountId,
        ]
        for (const candidate of candidates) {
            if (candidate && MatchingService.sameManagedAccountKey(managedAccountId, candidate)) return true
        }

        if (fusionIdentity.accountIdsSet) {
            for (const candidate of fusionIdentity.accountIdsSet) {
                if (candidate && MatchingService.sameManagedAccountKey(managedAccountId, candidate)) return true
            }
        }
        if (fusionIdentity.missingAccountIdsSet) {
            for (const candidate of fusionIdentity.missingAccountIdsSet) {
                if (candidate && MatchingService.sameManagedAccountKey(managedAccountId, candidate)) return true
            }
        }
        return false
    }

    private static sameManagedAccountKey(a: string | undefined, b: string | undefined): boolean {
        if (!a || !b) return false
        if (a === b) return true
        const normalizedA = normalizeCompositeManagedAccountKey(a)
        const normalizedB = normalizeCompositeManagedAccountKey(b)
        return normalizedA !== undefined && normalizedA === normalizedB
    }

    /**
     * Compares two fusion accounts across all configured matching rules and records
     * a match if the weighted combined score and mandatory rules pass.
     *
     * Identity candidates use a numeric fast path (no per-rule ScoreReport on non-matches).
     * Threshold passes reconstruct the stored `scores` breakdown without re-scoring.
     * Deferred candidates always build a full ScoreReport[] breakdown.
     *
     * @param fusionAccount - The candidate account being evaluated
     * @param fusionIdentity - The existing identity to compare against
     */
    private compareFusionAccounts(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        candidateType: MatchCandidateType,
        useFullBreakdown: boolean
    ): void {
        if (!useFullBreakdown) {
            if (!this.evaluateCombinedScorePass(fusionAccount, fusionIdentity)) {
                return
            }
            const scores = materializeScoreReportsFromNumeric(
                this.ruleNumericScratch,
                this.matchingConfigs,
                this.fusionManualReviewScore
            )
            this.storeThresholdPassingMatch(fusionAccount, fusionIdentity, candidateType, scores)
            return
        }

        const scores: ScoreReport[] = []
        let hasFailedMandatory = false
        let weightedSum = 0
        let weightTotal = 0

        for (let i = 0; i < this.matchingConfigs.length; i++) {
            const matching = this.matchingConfigs[i]
            const accountAttribute = fusionAccount.attributes[matching.attribute]
            const identityAttribute = fusionIdentity.attributes[matching.attribute]
            const skipForMissing = effectiveSkipMatchIfMissing(matching)
            const hasMissingValue =
                this.isMissingMatchValue(accountAttribute) || this.isMissingMatchValue(identityAttribute)

            if (skipForMissing && hasMissingValue) {
                scores.push(makeSkippedReport(matching, 'Rule skipped (missing value on one or both sides)'))
                continue
            }

            const lig3UpperBoundSkip = this.lig3UpperBoundSkipForPair(
                fusionAccount,
                fusionIdentity,
                matching,
                accountAttribute,
                identityAttribute
            )
            if (lig3UpperBoundSkip) {
                scores.push(lig3UpperBoundSkip)
                if (matching.mandatory) {
                    hasFailedMandatory = true
                    appendSkippedRemainingRules(scores, i + 1, this.matchingConfigs, MANDATORY_FAIL_SKIP_COMMENT)
                    break
                }
                continue
            }

            const scoreReport = this.scoreRulePair(
                fusionAccount,
                fusionIdentity,
                matching,
                accountAttribute,
                identityAttribute
            )
            scores.push(scoreReport)
            if (!scoreReport.skipped) {
                const w = MatchingService.blendWeight(scoreReport.fusionScore)
                weightedSum += w * scoreReport.score
                weightTotal += w
            }
            if (matching.mandatory && !scoreReport.isMatch) {
                hasFailedMandatory = true
                appendSkippedRemainingRules(scores, i + 1, this.matchingConfigs, MANDATORY_FAIL_SKIP_COMMENT)
                break
            }
            if (
                !hasFailedMandatory &&
                i + 1 < this.matchingConfigs.length &&
                MatchingService.maxAchievableCombinedScore(weightedSum, weightTotal, i + 1, this.matchingConfigs) <
                    this.fusionManualReviewScore
            ) {
                appendSkippedRemainingRules(scores, i + 1, this.matchingConfigs, THRESHOLD_SKIP_COMMENT)
                break
            }
        }

        const { combinedScore, hasContributing, combinedPasses } = evaluateCombinedScoreOutcome(
            weightedSum,
            weightTotal,
            this.fusionManualReviewScore,
            hasFailedMandatory
        )

        if (weightTotal > 0) {
            for (const s of scores) {
                if (s.skipped) continue
                const w = MatchingService.blendWeight(s.fusionScore)
                s.weightedScore = Math.round((w / weightTotal) * s.score * 100) / 100
            }
        }

        const combinedReport: ScoreReport = {
            attribute: COMBINED_SCORE_ROW_ATTRIBUTE,
            algorithm: WEIGHTED_MEAN_ALGORITHM,
            fusionScore: this.fusionManualReviewScore,
            mandatory: true,
            score: Math.round(combinedScore * 100) / 100,
            isMatch: combinedPasses,
            comment: combinedScoreComment(combinedPasses, hasFailedMandatory, hasContributing),
        }
        scores.push(combinedReport)

        if (combinedPasses) {
            this.storeThresholdPassingMatch(fusionAccount, fusionIdentity, candidateType, scores)
        }
    }

    private storeThresholdPassingMatch(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        candidateType: MatchCandidateType,
        scores: ScoreReport[]
    ): void {
        fusionAccount.layers.addFusionMatch({
            fusionIdentity,
            identityId: fusionIdentity.identityId ?? '',
            identityName: this.getIdentityDisplayLabel(fusionIdentity),
            candidateType,
            scores,
        })
    }

    private evaluateCombinedScoreRuleAtIndex(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        ruleIndex: number,
        weightedSum: number,
        weightTotal: number
    ): {
        numeric: RuleScoreNumeric
        skipped: boolean
        hasFailedMandatory: boolean
        shouldBreak: boolean
        weightedSum: number
        weightTotal: number
    } {
        const matching = this.matchingConfigs[ruleIndex]
        const accountAttribute = fusionAccount.attributes[matching.attribute]
        const identityAttribute = fusionIdentity.attributes[matching.attribute]
        const skipForMissing = effectiveSkipMatchIfMissing(matching)
        const hasMissingValue =
            this.isMissingMatchValue(accountAttribute) || this.isMissingMatchValue(identityAttribute)

        if (skipForMissing && hasMissingValue) {
            return {
                numeric: { score: 0, isMatch: false, skipped: true, skipReason: 'missing' },
                skipped: true,
                hasFailedMandatory: false,
                shouldBreak: false,
                weightedSum,
                weightTotal,
            }
        }

        if (
            this.isLig3UpperBoundUnreachable(
                fusionAccount,
                fusionIdentity,
                matching,
                accountAttribute,
                identityAttribute
            )
        ) {
            const numeric: RuleScoreNumeric = { score: 0, isMatch: false, skipped: true, skipReason: 'lig3-bound' }
            if (matching.mandatory) {
                return {
                    numeric,
                    skipped: false,
                    hasFailedMandatory: true,
                    shouldBreak: true,
                    weightedSum,
                    weightTotal,
                }
            }
            return { numeric, skipped: true, hasFailedMandatory: false, shouldBreak: false, weightedSum, weightTotal }
        }

        const ruleTotals = this.evaluateRuleTotals(
            fusionAccount,
            fusionIdentity,
            matching,
            accountAttribute,
            identityAttribute
        )
        let nextWeightedSum = weightedSum
        let nextWeightTotal = weightTotal
        if (!ruleTotals.skipped) {
            const w = MatchingService.blendWeight(matching.fusionScore)
            nextWeightedSum += w * ruleTotals.score
            nextWeightTotal += w
        }
        if (matching.mandatory && !ruleTotals.isMatch) {
            return {
                numeric: ruleTotals,
                skipped: false,
                hasFailedMandatory: true,
                shouldBreak: true,
                weightedSum: nextWeightedSum,
                weightTotal: nextWeightTotal,
            }
        }
        const shouldBreak =
            ruleIndex + 1 < this.matchingConfigs.length &&
            MatchingService.maxAchievableCombinedScore(
                nextWeightedSum,
                nextWeightTotal,
                ruleIndex + 1,
                this.matchingConfigs
            ) < this.fusionManualReviewScore

        return {
            numeric: ruleTotals,
            skipped: false,
            hasFailedMandatory: false,
            shouldBreak,
            weightedSum: nextWeightedSum,
            weightTotal: nextWeightTotal,
        }
    }

    /**
     * Fast-path combined score evaluation without allocating score breakdown arrays.
     * On pass, `ruleNumericScratch` holds one numeric result per configured rule.
     */
    private evaluateCombinedScorePass(fusionAccount: FusionAccount, fusionIdentity: FusionAccount): boolean {
        this.ruleNumericScratch.length = 0
        let hasFailedMandatory = false
        let weightedSum = 0
        let weightTotal = 0

        for (let i = 0; i < this.matchingConfigs.length; i++) {
            const result = this.evaluateCombinedScoreRuleAtIndex(
                fusionAccount,
                fusionIdentity,
                i,
                weightedSum,
                weightTotal
            )
            this.ruleNumericScratch.push(result.numeric)
            if (result.skipped) {
                continue
            }
            weightedSum = result.weightedSum
            weightTotal = result.weightTotal
            if (result.hasFailedMandatory) {
                hasFailedMandatory = true
                break
            }
            if (result.shouldBreak) {
                break
            }
        }

        return evaluateCombinedScoreOutcome(weightedSum, weightTotal, this.fusionManualReviewScore, hasFailedMandatory)
            .combinedPasses
    }

    /**
     * Score one matching rule for a fusion account pair (full breakdown path).
     * LIG3 upper-bound short-circuit is handled separately via {@link lig3UpperBoundSkipForPair}.
     */
    private scoreRulePair(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        matching: MatchingConfig,
        accountAttribute: unknown,
        identityAttribute: unknown
    ): ScoreReport {
        const scoreReport = this.dispatchRuleScore(
            fusionAccount,
            fusionIdentity,
            matching,
            accountAttribute,
            identityAttribute
        )
        if (!scoreReport.skipped && effectiveSkipMatchIfThresholdNotMet(matching) && !scoreReport.isMatch) {
            return makeSkippedReport(matching, 'Rule skipped (score below threshold)')
        }
        return scoreReport
    }

    /**
     * Rule totals for fast-path combined score evaluation. Uses numeric scorers only
     * (no ScoreReport allocation).
     */
    private evaluateRuleTotals(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        matching: MatchingConfig,
        accountAttribute: unknown,
        identityAttribute: unknown
    ): RuleScoreNumeric {
        const numeric = this.dispatchRuleScoreNumeric(
            fusionAccount,
            fusionIdentity,
            matching,
            accountAttribute,
            identityAttribute
        )
        if (!numeric.skipped && effectiveSkipMatchIfThresholdNotMet(matching) && !numeric.isMatch) {
            return { score: 0, isMatch: false, skipped: true, skipReason: 'below-threshold' }
        }
        return numeric
    }

    /** Shared algorithm dispatch for the deferred (full breakdown) comparison path. */
    private dispatchRuleScore(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        matching: MatchingConfig,
        accountAttribute: unknown,
        identityAttribute: unknown
    ): ScoreReport {
        if (matching.algorithm === 'lig3') {
            const normAccount = this.getNormalized(
                fusionAccount,
                matching.attribute,
                (accountAttribute ?? '').toString()
            )
            const normIdentity = this.getNormalized(
                fusionIdentity,
                matching.attribute,
                (identityAttribute ?? '').toString()
            )
            return scoreLIG3Normalized(normAccount, normIdentity, matching)
        }
        if (matching.algorithm === 'name-matcher') {
            const normAccount = this.getNameNormalized(
                fusionAccount,
                matching.attribute,
                (accountAttribute ?? '').toString()
            )
            const normIdentity = this.getNameNormalized(
                fusionIdentity,
                matching.attribute,
                (identityAttribute ?? '').toString()
            )
            return scoreNameMatcherNormalized(
                normAccount,
                normIdentity,
                matching,
                this.run?.nameMatcherTokenCache,
                this.run?.nameMatcherPhoneticCache
            )
        }
        return this.scoreAttribute((accountAttribute ?? '').toString(), (identityAttribute ?? '').toString(), matching)
    }

    /** Numeric algorithm dispatch for the identity fast path. */
    private dispatchRuleScoreNumeric(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        matching: MatchingConfig,
        accountAttribute: unknown,
        identityAttribute: unknown
    ): RuleScoreNumeric {
        if (matching.algorithm === 'lig3') {
            const normAccount = this.getNormalized(
                fusionAccount,
                matching.attribute,
                (accountAttribute ?? '').toString()
            )
            const normIdentity = this.getNormalized(
                fusionIdentity,
                matching.attribute,
                (identityAttribute ?? '').toString()
            )
            return scoreLIG3NormalizedNumeric(normAccount, normIdentity, matching)
        }
        if (matching.algorithm === 'name-matcher') {
            const normAccount = this.getNameNormalized(
                fusionAccount,
                matching.attribute,
                (accountAttribute ?? '').toString()
            )
            const normIdentity = this.getNameNormalized(
                fusionIdentity,
                matching.attribute,
                (identityAttribute ?? '').toString()
            )
            return scoreNameMatcherNormalizedNumeric(
                normAccount,
                normIdentity,
                matching,
                this.run?.nameMatcherTokenCache,
                this.run?.nameMatcherPhoneticCache
            )
        }
        return this.scoreAttributeNumeric(
            (accountAttribute ?? '').toString(),
            (identityAttribute ?? '').toString(),
            matching
        )
    }

    /** LIG3 length-ratio upper bound check without allocating a skip ScoreReport. */
    private isLig3UpperBoundUnreachable(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        matching: MatchingConfig,
        accountAttribute: unknown,
        identityAttribute: unknown
    ): boolean {
        if (matching.algorithm !== 'lig3') return false
        const normAccount = this.getNormalized(fusionAccount, matching.attribute, (accountAttribute ?? '').toString())
        const normIdentity = this.getNormalized(
            fusionIdentity,
            matching.attribute,
            (identityAttribute ?? '').toString()
        )
        return lig3UpperBound(normAccount, normIdentity) < (matching.fusionScore ?? 0)
    }

    /** Normalization cache + delegate to {@link lig3UpperBoundSkipIfUnreachable}. */
    private lig3UpperBoundSkipForPair(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        matching: MatchingConfig,
        accountAttribute: unknown,
        identityAttribute: unknown
    ): ScoreReport | undefined {
        if (matching.algorithm !== 'lig3') return undefined
        const normAccount = this.getNormalized(fusionAccount, matching.attribute, (accountAttribute ?? '').toString())
        const normIdentity = this.getNormalized(
            fusionIdentity,
            matching.attribute,
            (identityAttribute ?? '').toString()
        )
        return lig3UpperBoundSkipIfUnreachable(matching, normAccount, normIdentity)
    }

    /**
     * Build a user-friendly label for report candidates.
     * Prefer displayName/name, then fall back to uid-like identifiers.
     */
    private getIdentityDisplayLabel(fusionIdentity: FusionAccount): string {
        const identityDisplayName = trimStr(fusionIdentity.identityDisplayName) ?? ''
        if (identityDisplayName) return identityDisplayName

        const identityId = trimStr(fusionIdentity.identityId) ?? ''
        if (identityId) return identityId

        const fallback = trimStr(fusionIdentity.managedKeyOrUndefined) ?? ''
        return fallback || 'Unknown'
    }

    /**
     * Scores a single attribute pair using the algorithm specified in the matching config.
     *
     * Supported algorithms: name-matcher, jaro-winkler, dice, double-metaphone, lig3, binary.
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
            case 'binary':
                return scoreBinary(accountAttribute, identityAttribute, matchingConfig)
            case 'custom':
                return scoreCustomVelocity(accountAttribute, identityAttribute, matchingConfig)
        }
        return makeSkippedReport(matchingConfig, 'Unknown algorithm')
    }

    private scoreAttributeNumeric(
        accountAttribute: string,
        identityAttribute: string,
        matchingConfig: MatchingConfig
    ): RuleScoreNumeric {
        switch (matchingConfig.algorithm) {
            case 'name-matcher':
                return scoreNameMatcherNumeric(accountAttribute, identityAttribute, matchingConfig)
            case 'jaro-winkler':
                return scoreJaroWinklerNumeric(accountAttribute, identityAttribute, matchingConfig)
            case 'dice':
                return scoreDiceNumeric(accountAttribute, identityAttribute, matchingConfig)
            case 'double-metaphone':
                return scoreDoubleMetaphoneNumeric(accountAttribute, identityAttribute, matchingConfig)
            case 'lig3':
                return scoreLIG3NormalizedNumeric(
                    normalizeLIG3(accountAttribute),
                    normalizeLIG3(identityAttribute),
                    matchingConfig
                )
            case 'binary':
                return scoreBinaryNumeric(accountAttribute, identityAttribute, matchingConfig)
            case 'custom':
                return scoreCustomVelocityNumeric(accountAttribute, identityAttribute, matchingConfig)
        }
        return { score: 0, isMatch: false, skipped: true, comment: 'Unknown algorithm' }
    }

    /**
     * Match values are considered missing when null/undefined, or when their string
     * representation is empty after trimming whitespace.
     */
    private isMissingMatchValue(value: unknown): boolean {
        return missing(value)
    }
}
