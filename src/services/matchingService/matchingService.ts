import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { assert } from '../../utils/assert'
import { MatchingConfig, FusionConfig, effectiveSkipMatchIfMissing, effectiveSkipMatchIfThresholdNotMet } from '../../model/config'
import { resolveFusionMaxCandidatesForForm } from '../../data/config'
import {
    countIdentityCandidateFusionMatches,
} from './matchingHelpers'
import { FusionMatch, MatchCandidateType, ScoreReport, ScoringOptions } from './types'
import {
    normalizeLIG3,
    lig3UpperBound,
    lig3UpperBoundSkipIfUnreachable,
    scoreBinary,
    scoreCustomVelocity,
    scoreDice,
    scoreDoubleMetaphone,
    scoreJaroWinkler,
    scoreLIG3,
    scoreLIG3Normalized,
    scoreNameMatcher,
    scoreNameMatcherNormalized,
} from './scoringHelpers'
import { normalizeName as normalizeNameForMatcher } from './nameMatching'
import { buildAttributeIndex, queryAttributeIndex } from './trigramIndex'
import { isExactAttributeMatchScores } from './exactMatch'
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

function combinedScoreComment(
    combinedPasses: boolean,
    hasFailedMandatory: boolean,
    hasContributing: boolean
): string {
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

/** Minimal rule outcome for fast-path combined score evaluation (no ScoreReport retention). */
type RuleScoreTotals = {
    score: number
    isMatch: boolean
    skipped: boolean
    fusionScore?: number
}

/**
 * Service for calculating and managing similarity scores for identity matching.
 * Handles score calculation, threshold checking, and score formatting.
 */
export class MatchingService {
    private readonly matchingConfigs: MatchingConfig[]
    private readonly fusionManualReviewScore: number
    private readonly fusionEnableAutoMerge: boolean
    private readonly fusionMaxIdentityMatchCandidates: number
    private readonly fusionScoreMap: Map<string, number>
    private _scoringOptions: ScoringOptions = {}

    /**
     * @param config - Fusion configuration containing matching rules and score thresholds
     * @param log - Logger instance
     * @param run - Per-run state container for trigram index and normalization caches
     */
    constructor(config: FusionConfig, _log: LogService, private run?: FusionRun) {
        this.matchingConfigs = config.matchingConfigs ?? []
        this.fusionManualReviewScore = config.fusionManualReviewScore ?? 0
        this.fusionEnableAutoMerge = config.fusionEnableAutoMerge ?? false
        this.fusionMaxIdentityMatchCandidates = resolveFusionMaxCandidatesForForm(config.fusionMaxCandidatesForForm)
        this.fusionScoreMap = config.fusionScoreMap ?? new Map()
    }

    /**
     * Run-scoped scoring options set once per aggregation run.
     * Deferred candidates always use full breakdown regardless of `captureBreakdown`
     * (`candidateType !== Identity` in `scoreFusionAccount`).
     */
    public configureScoring(options: ScoringOptions): void {
        this._scoringOptions = options
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
     * Build the trigram blocking index over all fusion identities for their mandatory matching attributes.
     * Must be called once before {@link getCandidates} is used.
     *
     * The index maps each mandatory attribute to an inverted trigram map so that a managed account
     * can retrieve only the identity candidates that share at least one trigram with its attribute value,
     * reducing the scoring candidate pool from O(m) to O(k) where k << m.
     *
     * Only mandatory attributes are indexed: non-mandatory attributes cannot be used to safely eliminate
     * candidates, since a missing or non-matching non-mandatory attribute does not disqualify a pair.
     *
     * @param identities - All fusion identities to index (pass `allFusionIdentities` — collected
     *   internally into an array so generators can be reused across multiple attribute sweeps)
     */
    public buildTrigramIndex(identities: Iterable<FusionAccount>): void {
        if (!this.run) return
        this.run.trigramIndexByAttribute.clear()
        this.run.indexedMandatoryAttributes = []
        this.run.trigramIndexBuilt = false

        const mandatoryConfigs = this.matchingConfigs.filter((c) => c.mandatory === true)
        if (mandatoryConfigs.length === 0) return

        // Collect once; generators can only be iterated once but we need one sweep per attribute.
        const identityArray = Array.from(identities)
        for (const config of mandatoryConfigs) {
            const idx = buildAttributeIndex(identityArray, config.attribute)
            this.run.trigramIndexByAttribute.set(config.attribute, idx)
            this.run.indexedMandatoryAttributes.push(config.attribute)
        }
        this.run.trigramIndexBuilt = true
    }

    /**
     * Return a pre-filtered candidate set for `account` using the trigram blocking index,
     * or `undefined` if no filtering was possible (index not built, no mandatory attributes,
     * or account has no value for any mandatory attribute).
     *
     * When `undefined` is returned the caller must fall back to a full identity scan.
     *
     * The returned Set already has `excludeIds` applied, so the caller can iterate it directly.
     *
     * @param account - The managed account being scored
     * @param log - Optional logger; when provided, throttled warnings are emitted on full-scan fallback
     * @param excludeIds - Identity IDs to exclude from the candidate set (e.g. auto-assigned identities)
     */
    public getCandidates(
        account: FusionAccount,
        log?: LogService,
        excludeIds?: ReadonlySet<string>
    ): Set<FusionAccount> | undefined {
        if (!this.run || !this.run.trigramIndexBuilt || this.run.indexedMandatoryAttributes.length === 0) return undefined

        let resultSet: Set<FusionAccount> | undefined

        for (const attrName of this.run.indexedMandatoryAttributes) {
            const raw = account.attributes[attrName]
            if (missing(raw)) {
                // Account has no value for this mandatory attribute — cannot filter by it.
                continue
            }
            const idx = this.run.trigramIndexByAttribute.get(attrName)!
            const attrCandidates = queryAttributeIndex(idx, String(raw))

            if (resultSet === undefined) {
                resultSet = attrCandidates
            } else {
                // Intersection: keep only identities present in BOTH sets.
                for (const identity of resultSet) {
                    if (!attrCandidates.has(identity)) resultSet.delete(identity)
                }
            }
        }

        if (resultSet === undefined) {
            // All mandatory attributes were missing on this account — fall back to full scan.
            if (this.run) {
                this.run.fullScanFallbackCount = (this.run.fullScanFallbackCount ?? 0) + 1
                const fallbackCount = this.run.fullScanFallbackCount
                if (log && (fallbackCount <= 5 || fallbackCount % 100 === 0)) {
                    log.warn(
                        `Full identity scan fallback #${fallbackCount}: account has no value for any mandatory trigram attribute`
                    )
                }
            }
            return undefined
        }

        // Apply auto-assigned exclusions within the candidate set.
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
     * Scores a fusion account against all existing fusion identities to find matches.
     * For each identity that meets the matching threshold, a {@link FusionMatch} is
     * added to the fusion account via {@link FusionAccount#addFusionMatch}.
     *
     * Yields periodically so heavy Match scoring does not block the Node event loop.
     *
     * @param fusionAccount - The account to score (typically a provisional Fusion account)
     * @param fusionIdentities - The set of existing fusion identities to compare against
     * @param maxIdentityMatches - When set, stop scoring against further identities once this many
     *   threshold-passing identity-origin matches are recorded (same cap as the review form).
     *   Omitted or undefined disables this early exit (e.g. tests).
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

        // When exact-match automatic merge is enabled, there is no benefit in
        // continuing to score after a perfect match is found: the first exact match
        // wins and all subsequent comparisons would be discarded. Early exit here
        // avoids O(n) identity comparisons for every exact-match account.
        const earlyExitOnExactMatch = this.fusionEnableAutoMerge && candidateType === MatchCandidateType.Identity
        const maxIdentity =
            candidateType === MatchCandidateType.Identity
                ? (maxIdentityMatches ?? this.fusionMaxIdentityMatchCandidates)
                : undefined

        const captureBreakdown = Boolean(this._scoringOptions.captureBreakdown) || candidateType !== MatchCandidateType.Identity

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
            this.compareFusionAccounts(fusionAccount, fusionIdentity, candidateType, captureBreakdown)
            compared += 1
            if (earlyExitOnExactMatch) {
                const matches = fusionAccount.fusionMatchesRaw
                if (matches.length > 0 && isExactAttributeMatchScores(matches[matches.length - 1].scores)) {
                    break
                }
            }
            if (
                maxIdentity !== undefined &&
                countIdentityCandidateFusionMatches(fusionAccount.fusionMatchesRaw) >= maxIdentity
            ) {
                break
            }
            yieldCounter += 1
            if (yieldCounter >= SCORING_IDENTITY_YIELD_INTERVAL) {
                yieldCounter = 0
                await new Promise<void>((resolve) => setImmediate(resolve))
            }
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
     * When `captureBreakdown` is false (identity sweep, no report capture), uses a fast path
     * that avoids ScoreReport[] allocation on non-matches. Matches are re-scored with full
     * breakdown since they are rare compared to non-matches.
     *
     * @param fusionAccount - The candidate account being evaluated
     * @param fusionIdentity - The existing identity to compare against
     */
    private compareFusionAccounts(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        candidateType: MatchCandidateType,
        captureBreakdown: boolean
    ): void {
        if (!captureBreakdown) {
            if (!this.evaluateCombinedScorePass(fusionAccount, fusionIdentity)) {
                return
            }
            this.compareFusionAccounts(fusionAccount, fusionIdentity, candidateType, true)
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
            fusionAccount.layers.addFusionMatch(fusionMatch)
        }
    }

    private evaluateCombinedScoreRuleAtIndex(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        ruleIndex: number,
        weightedSum: number,
        weightTotal: number
    ): {
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
            return { skipped: true, hasFailedMandatory: false, shouldBreak: false, weightedSum, weightTotal }
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
            if (matching.mandatory) {
                return { skipped: false, hasFailedMandatory: true, shouldBreak: true, weightedSum, weightTotal }
            }
            return { skipped: true, hasFailedMandatory: false, shouldBreak: false, weightedSum, weightTotal }
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
            const w = MatchingService.blendWeight(ruleTotals.fusionScore)
            nextWeightedSum += w * ruleTotals.score
            nextWeightTotal += w
        }
        if (matching.mandatory && !ruleTotals.isMatch) {
            return {
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
            skipped: false,
            hasFailedMandatory: false,
            shouldBreak,
            weightedSum: nextWeightedSum,
            weightTotal: nextWeightTotal,
        }
    }

    /**
     * Fast-path combined score evaluation without allocating score breakdown arrays.
     */
    private evaluateCombinedScorePass(fusionAccount: FusionAccount, fusionIdentity: FusionAccount): boolean {
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

        return evaluateCombinedScoreOutcome(
            weightedSum,
            weightTotal,
            this.fusionManualReviewScore,
            hasFailedMandatory
        ).combinedPasses
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
     * Rule totals for fast-path combined score evaluation. Scorer functions may allocate transient
     * ScoreReport objects; this path does not retain them or build breakdown arrays.
     */
    private evaluateRuleTotals(
        fusionAccount: FusionAccount,
        fusionIdentity: FusionAccount,
        matching: MatchingConfig,
        accountAttribute: unknown,
        identityAttribute: unknown
    ): RuleScoreTotals {
        const scoreReport = this.dispatchRuleScore(
            fusionAccount,
            fusionIdentity,
            matching,
            accountAttribute,
            identityAttribute
        )
        if (!scoreReport.skipped && effectiveSkipMatchIfThresholdNotMet(matching) && !scoreReport.isMatch) {
            return { score: 0, isMatch: false, skipped: true, fusionScore: matching.fusionScore }
        }
        return {
            score: scoreReport.score,
            isMatch: scoreReport.isMatch,
            skipped: scoreReport.skipped ?? false,
            fusionScore: scoreReport.fusionScore,
        }
    }

    /** Shared algorithm dispatch for full and fast comparison paths. */
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
            return scoreNameMatcherNormalized(normAccount, normIdentity, matching)
        }
        return this.scoreAttribute(
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
        const identityDisplayName = trimStr(fusionIdentity.identityAlias) ?? ''
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

    /**
     * Match values are considered missing when null/undefined, or when their string
     * representation is empty after trimming whitespace.
     */
    private isMissingMatchValue(value: unknown): boolean {
        return missing(value)
    }
}

