import { FusionAccount } from '../../model/account'
import { IdentityDocument, OwnerDto } from 'sailpoint-api-client'
import { logger } from '@sailpoint/connector-sdk'
import { SourceService } from '../sourceService'
import { assert } from '../../utils/assert'
import { FusionMatch, MatchCandidateType } from '../scoringService/types'
import { Candidate } from './types'
import { internalConfig } from '../../data/connectorDefaults'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Primary line of the identities SEARCH_V2 SELECT (`label: 'attributes.displayName'` in formBuilder).
 * Form conditions must compare against this exact string so ISC show/hide rules match the dropdown.
 */
export const resolveIdentitiesSelectLabel = (
    fusionAttributes: Record<string, any>,
    identityId: string,
    identityDocument?: IdentityDocument
): string => {
    const fromIndex = identityDocument?.attributes
        ? String((identityDocument.attributes as Record<string, unknown>).displayName ?? '').trim()
        : ''
    if (fromIndex) return fromIndex

    const fromFusion = String(fusionAttributes?.displayName ?? '').trim()
    if (fromFusion) return fromFusion

    const fromIdentityName = String(identityDocument?.name ?? '').trim()
    if (fromIdentityName) return fromIdentityName

    // During initial candidate build we may not have hydrated identity documents yet.
    // Only emit this warning once we've actually attempted identity lookup.
    if (identityDocument) {
        logger.error(
            `[formBuilder] Candidate identity ${identityId} has no attributes.displayName for identities SELECT; ` +
                `form conditions may not match the dropdown. Using identity.name (or identityId) as fallback label.`
        )
    }
    return identityId
}

/**
 * Sort key for ranking match candidates on review forms: combined match score when present,
 * otherwise the best non-skipped rule score.
 */
const rankScoreForMatch = (match: FusionMatch): number => {
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

const compareMatchesForForm = (a: FusionMatch, b: FusionMatch): number => {
    const delta = rankScoreForMatch(b) - rankScoreForMatch(a)
    if (delta !== 0) return delta
    const ida = String(a.fusionIdentity?.identityId ?? a.identityId ?? '')
    const idb = String(b.fusionIdentity?.identityId ?? b.identityId ?? '')
    return ida.localeCompare(idb)
}

/** Matches counted toward the review-form cap (excludes deferred same-run peer candidates). */
export const countIdentityBackedFusionMatches = (matches: readonly FusionMatch[] | undefined): number => {
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
 * Build the ordered candidate list for a fusion review form (highest combined score first),
 * capped at `maxCandidates` (configured via `fusionMaxCandidatesForForm`).
 */
export const buildCandidateList = (fusionAccount: FusionAccount, maxCandidates: number): Candidate[] => {
    assert(fusionAccount, 'Fusion account is required')
    assert(fusionAccount.fusionMatches, 'Fusion matches are required')
    assert(
        maxCandidates >= 1 && maxCandidates <= internalConfig.fusionMaxCandidatesForFormMax,
        `maxCandidates must be between 1 and ${internalConfig.fusionMaxCandidatesForFormMax}`
    )

    const ordered = [...fusionAccount.fusionMatches].sort(compareMatchesForForm).slice(0, maxCandidates)

    return ordered.map((match) => {
        assert(match.fusionIdentity, 'Fusion identity is required in match')
        assert(match.fusionIdentity.identityId, 'Fusion identity ID is required')
        const attrs: Record<string, any> = match.fusionIdentity.attributes || {}
        const id = match.fusionIdentity.identityId
        return {
            id,
            name: resolveIdentitiesSelectLabel(attrs, id),
            attributes: attrs,
            scores: match.scores || [],
        }
    })
}

/**
 * Build form name from fusion account (pattern, display name, source label only).
 */
export const buildFormName = (fusionAccount: FusionAccount, fusionFormNamePattern: string): string => {
    const accountName = fusionAccount.name || fusionAccount.displayName || 'Unknown'
    const source = `[${fusionAccount.sourceName}]`
    return `${fusionFormNamePattern} - ${accountName} ${source}`
}

/**
 * Calculate form expiration date
 */
export const calculateExpirationDate = (fusionFormExpirationDays: number): string => {
    const expirationDate = new Date()
    expirationDate.setDate(expirationDate.getDate() + fusionFormExpirationDays)
    return expirationDate.toISOString()
}

/**
 * Get form owner from fusion source
 */
export const getFormOwner = (sources: SourceService): OwnerDto => {
    const owner = sources.fusionSourceOwner
    assert(owner, 'Fusion source owner not found')
    return owner
}
