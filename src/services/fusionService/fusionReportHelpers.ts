import { FusionAccount } from '../../model/account'
import { SourceType } from '../../model/config'
import { pickAttributes } from '../../utils/attributes'
import { roundMetric2 } from '../../utils/numbers'
import { UrlContext } from '../../utils/url'
import type { FusionMatch, ScoreReport } from '../scoringService/types'
import {
    FusionReportAccount,
    FusionReportIdentityConflictOccurrence,
    FusionReportMatch,
    FusionReportScore,
    FusionReportWarnings,
} from './types'

/**
 * Turn in-memory {@link ScoreReport} rows into the slim payload used by fusion report / email templates.
 * Renames nothing in the wire format (`score` = raw Value %, `weightedScore` = blend partial); only rounds for stable output.
 */
export function mapScoreReportsForFusionReport(scoreReports: ScoreReport[]): FusionReportScore[] {
    return scoreReports.map((row) => ({
        attribute: row.attribute,
        algorithm: row.algorithm,
        score: roundMetric2(row.score),
        weightedScore: row.weightedScore !== undefined ? roundMetric2(row.weightedScore) : undefined,
        fusionScore: row.fusionScore,
        isMatch: row.isMatch,
        skipped: row.skipped,
        comment: row.comment,
    }))
}

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

/** Fusion candidate keys for report / dry-run rows (works after `fusionIdentity` refs are cleared). */
export function fusionReportMatchCandidateAccountFields(match: FusionMatch): Pick<FusionReportMatch, 'accountId' | 'accountName'> {
    const fi = match.fusionIdentity
    if (fi) {
        const accountId =
            String(fi.identityId ?? fi.nativeIdentityOrUndefined ?? '').trim() || undefined
        return { accountId, accountName: getFusionReportAccountLabel(fi) }
    }
    const id = String(match.identityId ?? '').trim()
    return {
        accountId: id || undefined,
        accountName: match.identityName,
    }
}

export function getFusionReportAccountLabel(fusionAccount: FusionAccount): string {
    const rowTitle = String(fusionAccount.name ?? '').trim()
    if (rowTitle) return rowTitle

    const idn = String(fusionAccount.identityDisplayName ?? '').trim()
    if (idn) return idn

    const legacyDisplayName = String(fusionAccount.displayName ?? '').trim()
    if (legacyDisplayName) return legacyDisplayName

    const uid = String(
        fusionAccount.managedAccountId ??
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
        sourceType: (sourceType as FusionReportAccount['sourceType']) ?? SourceType.Authoritative,
        accountId: fusionAccount.managedAccountId,
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
