import { FusionAccount } from '../../model/account'
import { SourceType } from '../../model/config'
import { IdentityDocument, OwnerDto } from 'sailpoint-api-client'
import { logger } from '@sailpoint/connector-sdk'
import { SourceService } from '../sourceService'
import { assert } from '../../utils/assert'
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
        ? String((identityDocument.attributes as Record<string, unknown>).displayName ?? '').trim()
        : ''
    if (fromIndex) return fromIndex

    const fromFusion = String(fusionAttributes?.displayName ?? '').trim()
    if (fromFusion) return fromFusion

    logger.error(
        `[formBuilder] Candidate identity ${identityId} has no attributes.displayName for identities SELECT; ` +
            `form conditions may not match the dropdown. Using identityId as last-resort label.`
    )
    return identityId
}

/**
 * Build candidate list from fusion matches
 */
export const buildCandidateList = (fusionAccount: FusionAccount): Candidate[] => {
    assert(fusionAccount, 'Fusion account is required')
    assert(fusionAccount.fusionMatches, 'Fusion matches are required')

    const candidates = fusionAccount.fusionMatches.map((match) => {
        assert(match.fusionIdentity, 'Fusion identity is required in match')
        assert(match.fusionIdentity.identityId, 'Fusion identity ID is required')
        const attrs: Record<string, any> = match.fusionIdentity.attributes || {}
        // Label uses attributes.displayName (same as SEARCH_V2 SELECT). Value remains identityId.
        const id = match.fusionIdentity.identityId
        return {
            id,
            name: resolveIdentitiesSelectLabel(attrs, id),
            attributes: attrs,
            scores: match.scores || [],
        }
    })

    return candidates
}

/**
 * Build form name from fusion account.
 * Orphan-source reviews omit the account id segment so titles stay readable (managed id is often a long opaque value).
 */
export const buildFormName = (
    fusionAccount: FusionAccount,
    fusionFormNamePattern: string,
    sourceType: SourceType = 'authoritative'
): string => {
    const accountName = fusionAccount.name || fusionAccount.displayName || 'Unknown'
    const accountId =
        fusionAccount.nativeIdentityOrUndefined ||
        (fusionAccount as unknown as { nativeIdentity?: string }).nativeIdentity ||
        fusionAccount.managedAccountId ||
        'UnknownId'
    const source = `[${fusionAccount.sourceName}]`
    if (sourceType === 'orphan') {
        return `${fusionFormNamePattern} - ${accountName} ${source}`
    }
    return `${fusionFormNamePattern} - ${accountName} (${accountId}) ${source}`
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
