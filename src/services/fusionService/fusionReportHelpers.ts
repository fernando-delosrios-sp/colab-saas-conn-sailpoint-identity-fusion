import { FusionAccount } from '../../model/account'
import { pickAttributes } from '../../utils/attributes'
import { UrlContext } from '../../utils/url'
import {
    FusionReportAccount,
    FusionReportIdentityConflictOccurrence,
    FusionReportWarnings,
} from './types'

/**
 * Stable key for identity conflict tracking when nativeIdentity may be missing.
 */
export function getFusionIdentityConflictTrackingKey(fusionAccount: FusionAccount): string {
    const nativeIdentity = fusionAccount.nativeIdentityOrUndefined
    if (nativeIdentity && nativeIdentity.trim() !== '') {
        return nativeIdentity
    }
    const name = fusionAccount.name || fusionAccount.displayName || 'unknown'
    return `name:${name}`
}

/**
 * User-facing account label for fusion report rows.
 * Prefer displayName/name, then fall back to uid-like identifiers.
 */
export function getFusionReportAccountLabel(fusionAccount: FusionAccount): string {
    const accountDisplayName = String(fusionAccount.accountDisplayName ?? '').trim()
    if (accountDisplayName) return accountDisplayName

    const legacyDisplayName = String(fusionAccount.displayName ?? '').trim()
    if (legacyDisplayName) return legacyDisplayName

    const legacyName = String(fusionAccount.name ?? '').trim()
    if (legacyName) return legacyName

    const uid = String(
        fusionAccount.managedAccountId ??
            fusionAccount.nativeIdentityOrUndefined ??
            fusionAccount.identityId ??
            ''
    ).trim()
    return uid || 'Unknown'
}

/**
 * Minimal report row for non-matches and failed matchings (no identity candidates).
 */
export function buildMinimalFusionReportAccount(
    fusionAccount: FusionAccount,
    urlContext: UrlContext,
    sourceType: string | undefined,
    reportAttributes: string[],
    error?: string
): FusionReportAccount {
    const row: FusionReportAccount = {
        accountName: getFusionReportAccountLabel(fusionAccount),
        accountUrl: urlContext.humanAccount(fusionAccount.managedAccountId),
        accountSource: fusionAccount.sourceName,
        sourceType: (sourceType as FusionReportAccount['sourceType']) ?? 'authoritative',
        accountId: fusionAccount.managedAccountId ?? fusionAccount.nativeIdentityOrUndefined,
        accountEmail: fusionAccount.email,
        accountAttributes: pickAttributes(fusionAccount.attributes as any, reportAttributes),
        matches: [],
    }
    if (error !== undefined) {
        row.error = error
    }
    return row
}

const IDENTITY_CONFLICT_WARNING_MESSAGE =
    'More than one Fusion account was found for one or more identities. This is generally caused by non-unique account names. Please review the configuration and consider using a unique attribute for the account name.'

/**
 * Build report warning payload from in-memory conflict tracking map.
 */
export function buildIdentityConflictWarningsFromMap(
    conflictingFusionIdentityAccounts: Map<string, Map<string, string>>
): FusionReportWarnings | undefined {
    if (conflictingFusionIdentityAccounts.size === 0) {
        return undefined
    }

    const occurrences: FusionReportIdentityConflictOccurrence[] = []
    for (const [identityId, accounts] of conflictingFusionIdentityAccounts.entries()) {
        const nativeIdentities = Array.from(accounts.keys()).sort((a, b) => a.localeCompare(b))
        const accountNames = Array.from(new Set(accounts.values())).sort((a, b) => a.localeCompare(b))
        occurrences.push({
            identityId,
            accountCount: nativeIdentities.length,
            accountNames,
            nativeIdentities,
        })
    }
    occurrences.sort((a, b) => a.identityId.localeCompare(b.identityId))

    return {
        identityConflicts: {
            message: IDENTITY_CONFLICT_WARNING_MESSAGE,
            affectedIdentities: occurrences.length,
            occurrences,
        },
    }
}
