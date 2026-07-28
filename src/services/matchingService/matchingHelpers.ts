import { FusionAccount } from '../../model/account'
import { IDENTITIES_SOURCE_NAME } from '../../model/fusionAccount'
import { SourceType } from '../../model/config'
import { SourceInfo } from '../sourceService'
import { coerceBoolean } from '../../utils/safeRead'
import { isExactAttributeMatchScores } from './exactMatch'
import { FusionMatch, MatchCandidateType } from './types'

/**
 * Builds info-log headline and "- N candidate(s), M partial(s)" suffix from match scores.
 * "candidate(s)" counts exact (all rules 100, none skipped); "partial(s)" are other matches in the set.
 */
export function formatFusionMatchDiscoveryLog(
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

export function hasIdentityCandidateMatches(fusionAccount: FusionAccount): boolean {
    return fusionAccount.fusionMatches.some((match) => (match.candidateType ?? 'identity') === 'identity')
}

export function hasDeferredCandidateMatches(fusionAccount: FusionAccount): boolean {
    return fusionAccount.fusionMatches.some((match) => match.candidateType === 'deferred')
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
