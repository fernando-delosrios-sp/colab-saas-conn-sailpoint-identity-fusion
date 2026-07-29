import { FusionAccount } from '../../model/account'
import { FusionRun } from '../../model/fusionRun'
import { IDENTITIES_SOURCE_NAME } from '../../model/fusionAccount'
import { FusionConfig, SourceType } from '../../model/config'
import { SourceInfo } from '../sourceService'
import { coerceBoolean } from '../../utils/safeRead'
import { rankFusionMatchesForReview } from '../fusionService/helpers'
import { isExactAttributeMatchScores } from './exactMatch'
import { FusionMatch, MatchCandidateType } from './types'
import { LogService } from '../logService'
import { resolveFusionMaxCandidatesForForm } from '../../data/config'


/**
 * Builds info-log headline and "- N candidate(s), M partial(s)" suffix from match scores.
 * "candidate(s)" counts exact (all rules 100, none skipped); "partial(s)" are other matches in the set.
 */
function formatFusionMatchDiscoveryLog(
    matches: ReadonlyArray<FusionMatch>,
    deferred: boolean
): { headline: string; summary: string } {
    let exact = 0
    for (const m of matches) {
        if (isExactAttributeMatchScores(m.scores)) exact++
    }
    const partial = matches.length - exact
    const segments: string[] = []
    if (exact > 0) segments.push(`${exact} candidate(s)`)
    if (partial > 0) segments.push(`${partial} partial(s)`)
    const summary = segments.length > 0 ? segments.join(', ') : '0 candidate(s)'
    if (deferred) {
        return {
            headline: exact > 0 ? 'DEFERRED EXACT MATCH FOUND' : 'DEFERRED MATCH FOUND',
            summary,
        }
    }
    return {
        headline: exact > 0 ? 'EXACT MATCH FOUND' : 'MATCH FOUND',
        summary,
    }
}

export function isPersistedOrFinalizedDeferredTier(tier: string | undefined): boolean {
    return tier === 'persisted' || tier === 'finalized'
}

export interface LogMatchDiscoveryOptions {
    /** Appended to the debug line after the summary (e.g. "; skipping account for now"). */
    debugSuffix?: string
}

/** Record match discovery metrics and optional debug log for identity or deferred candidates. */
export function logFusionMatchDiscovery(
    log: Pick<LogService, 'recordEvent' | 'getLogLevel' | 'debug'>,
    matches: ReadonlyArray<FusionMatch>,
    deferred: boolean,
    accountName: string,
    sourceName: string | undefined,
    options?: LogMatchDiscoveryOptions
): void {
    const { headline, summary } = formatFusionMatchDiscoveryLog(matches, deferred)
    const eventType = deferred ? 'deferred' : headline.includes('EXACT') ? 'exact' : 'partial'
    log.recordEvent('match', { type: eventType })
    if (log.getLogLevel() === 'debug') {
        const suffix = options?.debugSuffix ?? ''
        log.debug(`${headline}: ${accountName} [${sourceName}] - ${summary}${suffix}`)
    }
}

/** Log deferred-match discovery using persisted/finalized anchors, ranked and capped for review. */
export function logDeferredMatchDiscoveryForReview(
    log: Pick<LogService, 'recordEvent' | 'getLogLevel' | 'debug'>,
    fusionAccount: FusionAccount,
    run: FusionRun,
    config: Pick<FusionConfig, 'fusionMaxCandidatesForForm'>,
    accountName: string,
    sourceName: string | undefined,
    options?: LogMatchDiscoveryOptions
): void {
    const maxCandidates = resolveFusionMaxCandidatesForForm(config.fusionMaxCandidatesForForm)
    const deferredMatches = anchorDeferredMatchesForReview(fusionAccount, run, maxCandidates)
    logFusionMatchDiscovery(log, deferredMatches, true, accountName, sourceName, options)
}

export function hasIdentityCandidateMatches(fusionAccount: FusionAccount): boolean {
    return fusionAccount.fusionMatches.some((match) => (match.candidateType ?? 'identity') === 'identity')
}

export function hasDeferredCandidateMatches(fusionAccount: FusionAccount): boolean {
    return fusionAccount.fusionMatches.some((match) => match.candidateType === 'deferred')
}

/** True when the account matched with deferred candidates only (no identity candidates). */
export function hasDeferredOnlyCandidateMatches(fusionAccount: FusionAccount): boolean {
    return (
        fusionAccount.isMatch &&
        !hasIdentityCandidateMatches(fusionAccount) &&
        hasDeferredCandidateMatches(fusionAccount)
    )
}

/**
 * True when at least one deferred match is against a persisted or finalized anchor in the registry.
 * Peer-only deferred matches (pending queue accounts not yet materialized) do not defer the incoming
 * account — the first clique member must become a non-match anchor when no registry anchors exist yet.
 */
export function hasActionableDeferredAnchorMatch(fusionAccount: FusionAccount, run: FusionRun): boolean {
    for (const match of fusionAccount.fusionMatches) {
        if (match.candidateType !== MatchCandidateType.Deferred) continue
        const candidate = match.fusionIdentity
        if (!candidate) continue
        const tier = run.getDeferredCandidateTier(candidate)
        if (isPersistedOrFinalizedDeferredTier(tier)) return true
    }
    return false
}

/** Deferred matches against persisted or finalized anchors — excludes pending peer queue accounts. */
export function anchorDeferredMatches(fusionAccount: FusionAccount, run: FusionRun): FusionMatch[] {
    return fusionAccount.fusionMatches.filter((match) => {
        if (match.candidateType !== MatchCandidateType.Deferred) return false
        const candidate = match.fusionIdentity
        if (!candidate) return false
        const tier = run.getDeferredCandidateTier(candidate)
        return isPersistedOrFinalizedDeferredTier(tier)
    })
}

/** Rank and optionally cap match rows for review surfaces (forms, reports, logs). */
function capFusionMatchesForReview(matches: FusionMatch[], maxCandidates?: number): FusionMatch[] {
    const ordered = rankFusionMatchesForReview(matches)
    return maxCandidates ? ordered.slice(0, maxCandidates) : ordered
}

/** Persisted/finalized deferred anchors, ranked and capped like identity review candidates. */
export function anchorDeferredMatchesForReview(
    fusionAccount: FusionAccount,
    run: FusionRun,
    maxCandidates?: number
): FusionMatch[] {
    return capFusionMatchesForReview(anchorDeferredMatches(fusionAccount, run), maxCandidates)
}

/** ISC identity candidates, ranked and capped for review surfaces (forms, reports). */
export function identityMatchesForReview(fusionAccount: FusionAccount, maxCandidates?: number): FusionMatch[] {
    const identityMatches = fusionAccount.fusionMatches.filter(
        (match) => (match.candidateType ?? MatchCandidateType.Identity) === MatchCandidateType.Identity
    )
    return capFusionMatchesForReview(identityMatches, maxCandidates)
}

/** Matches counted toward the review-form cap (excludes same-operation deferred candidates). */
export const countIdentityCandidateFusionMatches = (matches: readonly FusionMatch[] | undefined): number => {
    if (!matches) return 0
    let n = 0
    for (const m of matches) {
        if ((m.candidateType ?? MatchCandidateType.Identity) === MatchCandidateType.Identity) {
            n += 1
        }
    }
    return n
}


/**
 * Managed source name used to bucket deferred-match candidates.
 * Persisted fusion rows use the Fusion connector as `sourceName`; the managed source is `originSource`.
 */
export function deferredMatchSourceName(fusionAccount: FusionAccount): string | undefined {
    const originSource = fusionAccount.originSource?.trim()
    if (originSource && originSource !== IDENTITIES_SOURCE_NAME) {
        return originSource
    }
    const sourceName = fusionAccount.sourceName?.trim()
    return sourceName || undefined
}

export function isDeferredMatchingEnabledForSource(
    sourceName: string | undefined,
    sourcesByName: Map<string, SourceInfo>
): boolean {
    if (!sourceName) return false
    const info = sourcesByName.get(sourceName)
    const sourceType = info?.sourceType ?? SourceType.Authoritative
    if (sourceType !== SourceType.Authoritative) return false
    if (!info?.config) return true
    return coerceBoolean(info.config.deferredMatching) ?? true
}

export function isRecordMatchingEnabledForSource(
    sourceName: string | undefined,
    sourcesByName: Map<string, SourceInfo>
): boolean {
    if (!sourceName) return true
    const info = sourcesByName.get(sourceName)
    const sourceType = info?.sourceType ?? SourceType.Authoritative
    if (sourceType !== SourceType.Record) {
        return true
    }
    return coerceBoolean(info?.config?.includeRecordAccountsForMatching) ?? true
}




