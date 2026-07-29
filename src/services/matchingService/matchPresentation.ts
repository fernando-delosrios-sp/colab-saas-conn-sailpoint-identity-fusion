import { FusionAccount } from '../../model/account'
import { FusionRun } from '../../model/fusionRun'
import { FusionMatch, MatchCandidateType } from './types'

/** Rank identity match candidates for review surfaces (forms, emails) — highest combined score first. */
export function rankFusionMatchesForReview(matches: FusionMatch[]): FusionMatch[] {
    const rankScore = (match: FusionMatch): number => {
        const combined = match.scores?.find(
            (s) =>
                s.algorithm === 'weighted-mean' ||
                s.attribute === 'Combined score' ||
                s.attribute === 'Combined match score'
        )
        if (combined) return combined.score
        const scored = match.scores?.filter((s) => !s.skipped) ?? []
        if (scored.length === 0) return 0
        return Math.max(...scored.map((s) => s.score))
    }

    return [...matches].sort((a, b) => {
        const delta = rankScore(b) - rankScore(a)
        if (delta !== 0) return delta
        const ida = String(a.fusionIdentity?.identityId ?? a.identityId ?? '')
        const idb = String(b.fusionIdentity?.identityId ?? b.identityId ?? '')
        return ida.localeCompare(idb)
    })
}

export function isPersistedOrFinalizedDeferredTier(tier: string | undefined): boolean {
    return tier === 'persisted' || tier === 'finalized'
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
