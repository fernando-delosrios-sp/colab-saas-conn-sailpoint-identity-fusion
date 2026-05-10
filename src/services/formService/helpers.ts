import { FusionAccount } from '../../model/account'
import { IdentityDocument } from 'sailpoint-api-client'
import { logger } from '@sailpoint/connector-sdk'
import { FusionMatch, MatchCandidateType } from '../scoringService/types'
import { trimStr } from '../../utils/safeRead'
import { Candidate } from './types'

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
        ? (trimStr((identityDocument.attributes as Record<string, unknown>).displayName) ?? '')
        : ''
    if (fromIndex) return fromIndex

    const fromFusion = trimStr(fusionAttributes?.displayName) ?? ''
    if (fromFusion) return fromFusion

    const fromIdentityName = trimStr(identityDocument?.name) ?? ''
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
 * Build form name from fusion account with a stable account identifier suffix
 * to avoid collisions when multiple accounts share the same display name/source.
 */
export const buildFormName = (fusionAccount: FusionAccount, fusionFormNamePattern: string): string => {
    const accountName = fusionAccount.name || fusionAccount.displayName || 'Unknown'
    const source = `[${fusionAccount.sourceName}]`
    const accountIdentifier = trimStr(fusionAccount.nativeIdentity) || trimStr(fusionAccount.managedAccountId) || 'unknown'
    return `${fusionFormNamePattern} - ${accountName} ${source} (${accountIdentifier})`
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
 * Build candidate list from fusion account matches, sorted by combined match score descending,
 * capped at maxCandidates.
 */
export const buildCandidateList = (fusionAccount: FusionAccount, maxCandidates: number): Candidate[] => {
    const matches = fusionAccount.fusionMatches ?? []
    const scored = matches
        .filter((m) => m.fusionIdentity?.identityId)
        .map((m) => {
            const identityId = m.fusionIdentity!.identityId
            const displayName = m.fusionIdentity!.attributes?.displayName as string | undefined
            return {
                id: identityId,
                name: displayName || identityId,
                attributes: (m.fusionIdentity?.attributes ?? {}) as Record<string, any>,
                scores: m.scores ?? [],
            } as Candidate
        })

    scored.sort((a, b) => {
        const aMax = Math.max(
            0,
            ...(a.scores.filter((s) => s.score != null && !s.skipped).map((s) => s.score as number))
        )
        const bMax = Math.max(
            0,
            ...(b.scores.filter((s) => s.score != null && !s.skipped).map((s) => s.score as number))
        )
        if (bMax !== aMax) return bMax - aMax
        return a.id.localeCompare(b.id)
    })

    return scored.slice(0, maxCandidates)
}