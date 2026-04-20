import { FusionAccount } from '../../model/account'
import { MatchingConfig, FusionConfig, effectiveSkipMatchIfMissing } from '../../model/config'
import { defaultFusionMaxCandidatesForForm } from '../../data/config'
import { countIdentityBackedFusionMatches } from '../formService/helpers'
import { LogService } from '../logService'
import { FusionMatch, MatchCandidateType, ScoreReport } from './types'
import { normalizeLIG3, scoreDice, scoreDoubleMetaphone, scoreJaroWinkler, scoreLIG3, scoreLIG3Normalized, scoreNameMatcher } from './helpers'
import { TrigramIndex, buildAttributeIndex, queryAttributeIndex } from './trigramIndex'
import { isExactAttributeMatchScores } from './exactMatch'

/** Build a skipped ScoreReport without spreading the full MatchingConfig. */
function makeSkippedReport(matching: MatchingConfig, comment: string): ScoreReport {
    return {
        attribute: matching.attribute,
        algorithm: matching.algorithm,
        fusionScore: matching.fusionScore,
        mandatory: matching.mandatory,
        skipMatchIfMissing: matching.skipMatchIfMissing,
        score: 0,
        isMatch: false,
        skipped: true,
        comment,
    }
}

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
    private readonly fusionMaxIdentityMatchCandidates: number

    /**
     * Per-account cache of LIG3-normalized attribute values.
     * WeakMap keyed by FusionAccount so entries are GC'd when the account is released.
     * Eliminates O(n×m) repeated normalization: each identity attribute is normalized once,
     * each managed account attribute is normalized once — total O(n+m) normalizations.
     */
    private readonly normalizedCache: WeakMap<FusionAccount, Map<string, string>> = new WeakMap()

    /**
     * Trigram blocking index — built once per pipeline run over the full identity pool.
     * Maps each mandatory attribute name to its inverted trigram index.
     * Reduces O(n×m) identity comparisons to O(n×k) where k << m.
     *
     * Memory note: ~40 MB per indexed attribute for 50k identities with ~8-char average value length.
     */
    private trigramIndexByAttribute: Map<string, TrigramIndex> = new Map()
    private indexedMandatoryAttributes: string[] = []
    private trigramIndexBuilt = false

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
        this.fusionMaxIdentityMatchCandidates = config.fusionMaxCandidatesForForm ?? defaultFusionMaxCandidatesForForm()
    }

    /**
     * Blend weight from a rule's minimum similarity (`fusionScore`). Zero or unset uses 1 to avoid divide-by-zero.
     */
    static blendWeight(fusionScore?: number): number {
        const t = fusionScore ?? 0
        return t <= 0 ? 1 : t
    }

    /**
     * Return the LIG3-normalized form of `rawValue` for `account`, computing and caching on first access.
     * Cache is keyed by (FusionAccount, attributeName) so each (identity, attribute) pair is normalized once
     * regardless of how many managed accounts are scored against it.
     */
    private getNormalized(account: FusionAccount, attrName: string, rawValue: string): string {
        let byAttr = this.normalizedCache.get(account)
        if (!byAttr) {
            byAttr = new Map()
            this.normalizedCache.set(account, byAttr)
        }
        let cached = byAttr.get(attrName)
        if (cached === undefined) {
            cached = normalizeLIG3(rawValue)
            byAttr.set(attrName, cached)
        }
        return cached
    }

    /**
     * Conservative upper bound on the LIG3 similarity score for a pair of already-normalized strings.
     * LIG3 gap penalties (0.8–0.9) mean the similarity can never exceed `min(len1,len2)/max(len1,len2)*100`.
     * If this bound is below the required threshold, the full DP can be skipped entirely.
     */
    private static lig3UpperBound(normA: string, normB: string): number {
        const lenA = normA.length
        const lenB = normB.length
        if (lenA === 0 || lenB === 0) return 0
        return (Math.min(lenA, lenB) / Math.max(lenA, lenB)) * 100
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
            wRem += ScoringService.blendWeight(configs[j].fusionScore)
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
     * @param identities - All fusion identities to index (pass `fusionIdentityMap.values()` — collected
     *   internally into an array so generators can be reused across multiple attribute passes)
     */
    public buildTrigramIndex(identities: Iterable<FusionAccount>): void {
        this.trigramIndexByAttribute.clear()
        this.indexedMandatoryAttributes = []
        this.trigramIndexBuilt = false

        const mandatoryConfigs = this.matchingConfigs.filter((c) => c.mandatory === true)
        if (mandatoryConfigs.length === 0) return

        // Collect once; generators can only be iterated once but we need one pass per attribute.
        const identityArray = Array.from(identities)
        for (const config of mandatoryConfigs) {
            const idx = buildAttributeIndex(identityArray, config.attribute)
            this.trigramIndexByAttribute.set(config.attribute, idx)
            this.indexedMandatoryAttributes.push(config.attribute)
        }
        this.trigramIndexBuilt = true
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
     * @param excludeIds - Identity IDs to exclude from the candidate set (e.g. auto-assigned identities)
     */
    public getCandidates(account: FusionAccount, excludeIds?: ReadonlySet<string>): Set<FusionAccount> | undefined {
        if (!this.trigramIndexBuilt || this.indexedMandatoryAttributes.length === 0) return undefined

        let resultSet: Set<FusionAccount> | undefined

        for (const attrName of this.indexedMandatoryAttributes) {
            const raw = account.attributes[attrName]
            if (raw === null || raw === undefined || String(raw).trim().length === 0) {
                // Account has no value for this mandatory attribute — cannot filter by it.
                continue
            }
            const idx = this.trigramIndexByAttribute.get(attrName)!
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
     * @param fusionAccount - The account to score (typically a new/unmatched account)
     * @param fusionIdentities - The set of existing fusion identities to compare against
     * @param maxIdentityMatches - When set, stop scoring against further identities once this many
     *   threshold-passing identity-backed matches are recorded (same cap as the review form).
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

        // When exact-match automatic assignment is enabled, there is no benefit in
        // continuing to score after a perfect match is found: the first exact match
        // wins and all subsequent comparisons would be discarded. Early exit here
        // avoids O(n) identity comparisons for every exact-match account.
        const earlyExitOnExactMatch = this.fusionMergingExactMatch && candidateType === MatchCandidateType.Identity
        const maxIdentity =
            candidateType === MatchCandidateType.Identity
                ? (maxIdentityMatches ?? this.fusionMaxIdentityMatchCandidates)
                : undefined

        let compared = 0
        for (const fusionIdentity of fusionIdentities) {
            if (
                candidateType === MatchCandidateType.NewUnmatched &&
                this.isSameDeferredCandidate(fusionAccount, fusionIdentity)
            ) {
                continue
            }
            this.compareFusionAccounts(fusionAccount, fusionIdentity, candidateType)
            compared += 1
            if (earlyExitOnExactMatch) {
                const matches = fusionAccount.fusionMatchesRaw
                if (matches.length > 0 && isExactAttributeMatchScores(matches[matches.length - 1].scores)) {
                    break
                }
            }
            if (maxIdentity !== undefined && countIdentityBackedFusionMatches(fusionAccount.fusionMatchesRaw) >= maxIdentity) {
                break
            }
            if (compared % SCORING_IDENTITY_YIELD_INTERVAL === 0) {
                await new Promise<void>((resolve) => setImmediate(resolve))
            }
        }
        return compared
    }

    /**
     * Deferred matching compares a managed account against current-run unmatched peers.
     * Guard against accidental self-comparison to prevent a perfect self-match.
     */
    private isSameDeferredCandidate(fusionAccount: FusionAccount, fusionIdentity: FusionAccount): boolean {
        if (fusionAccount === fusionIdentity) return true

        const managedAccountId = fusionAccount.managedAccountId
        if (!managedAccountId) {
            return fusionAccount.nativeIdentityOrUndefined === fusionIdentity.nativeIdentityOrUndefined
        }

        if (managedAccountId === fusionIdentity.managedAccountId) {
            return true
        }

        if (managedAccountId === fusionIdentity.nativeIdentityOrUndefined) {
            return true
        }

        if (managedAccountId === fusionIdentity.originAccountId) {
            return true
        }

        if (fusionIdentity.accountIdsSet?.has(managedAccountId) || fusionIdentity.missingAccountIdsSet?.has(managedAccountId)) {
            return true
        }

        return false
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
        candidateType: MatchCandidateType
    ): void {
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

            // For LIG3: use pre-normalized cached values to avoid repeated normalization in the hot loop,
            // and apply a conservative length-ratio upper-bound check before running the full DP.
            let scoreReport: ScoreReport
            if (matching.algorithm === 'lig3') {
                const normAccount = this.getNormalized(fusionAccount, matching.attribute, (accountAttribute ?? '').toString())
                const normIdentity = this.getNormalized(fusionIdentity, matching.attribute, (identityAttribute ?? '').toString())
                if (ScoringService.lig3UpperBound(normAccount, normIdentity) < (matching.fusionScore ?? 0)) {
                    // Score is mathematically unreachable — skip as if the rule failed.
                    scoreReport = makeSkippedReport(matching, 'Length ratio upper bound below threshold')
                    scores.push(scoreReport)
                    if (matching.mandatory) {
                        hasFailedMandatory = true
                        for (let r = i + 1; r < this.matchingConfigs.length; r++) {
                            scores.push(makeSkippedReport(this.matchingConfigs[r], 'Rule skipped (mandatory attribute failed)'))
                        }
                        break
                    }
                    continue
                }
                scoreReport = scoreLIG3Normalized(normAccount, normIdentity, matching)
            } else {
                scoreReport = this.scoreAttribute(
                    (accountAttribute ?? '').toString(),
                    (identityAttribute ?? '').toString(),
                    matching
                )
            }
            scores.push(scoreReport)
            if (!scoreReport.skipped) {
                const w = ScoringService.blendWeight(scoreReport.fusionScore)
                weightedSum += w * scoreReport.score
                weightTotal += w
            }
            if (matching.mandatory && !scoreReport.isMatch) {
                hasFailedMandatory = true
                // Push skipped entries for all remaining rules so the scores
                // array stays structurally complete for report rendering.
                for (let r = i + 1; r < this.matchingConfigs.length; r++) {
                    scores.push(makeSkippedReport(this.matchingConfigs[r], 'Rule skipped (mandatory attribute failed)'))
                }
                break
            }
            if (
                !hasFailedMandatory &&
                i + 1 < this.matchingConfigs.length &&
                ScoringService.maxAchievableCombinedScore(weightedSum, weightTotal, i + 1, this.matchingConfigs) <
                    this.fusionAverageScore
            ) {
                for (let r = i + 1; r < this.matchingConfigs.length; r++) {
                    scores.push(
                        makeSkippedReport(this.matchingConfigs[r], 'Rule skipped (combined score cannot reach threshold)')
                    )
                }
                break
            }
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
        return makeSkippedReport(matchingConfig, 'Unknown algorithm')
    }

    /**
     * Match values are considered missing when null/undefined, or when their string
     * representation is empty after trimming whitespace.
     */
    private isMissingMatchValue(value: unknown): boolean {
        return value === null || value === undefined || String(value).trim().length === 0
    }
}
