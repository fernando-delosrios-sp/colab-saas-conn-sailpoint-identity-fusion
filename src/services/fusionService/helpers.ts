import { FusionAccount } from '../../model/account'
import { SourceType } from '../../model/config'
import { pickAttributes } from '../../utils/attributes'
import { trimStr } from '../../utils/safeRead'
import { roundMetric2 } from '../../utils/numbers'
import { UrlContext } from '../../utils/url'
import type { FusionMatch, ScoreReport } from '../scoringService/types'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { Account } from 'sailpoint-api-client'
import { FusionDecision } from '../../model/form'
import { getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import { assert } from '../../utils/assert'
import { readString } from '../../utils/safeRead'
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
    const trimmedNative = trimStr(nativeIdentity)
    if (trimmedNative) {
        return trimmedNative
    }
    const name = fusionAccount.name || fusionAccount.displayName || 'unknown'
    return `name:${name}`
}

/** Fusion candidate keys for report / dry-run rows (works after `fusionIdentity` refs are cleared). */
export function fusionReportMatchCandidateAccountFields(
    match: FusionMatch
): Pick<FusionReportMatch, 'accountId' | 'accountName'> {
    const fi = match.fusionIdentity
    if (fi) {
        const accountId = trimStr(fi.identityId ?? fi.nativeIdentityOrUndefined)
        return { accountId, accountName: getFusionReportAccountLabel(fi) }
    }
    const id = trimStr(match.identityId) ?? ''
    return {
        accountId: id || undefined,
        accountName: match.identityName,
    }
}

export function getFusionReportAccountLabel(fusionAccount: FusionAccount): string {
    const rowTitle = trimStr(fusionAccount.name) ?? ''
    if (rowTitle) return rowTitle

    const idn = trimStr(fusionAccount.identityDisplayName) ?? ''
    if (idn) return idn

    const legacyDisplayName = trimStr(fusionAccount.displayName) ?? ''
    if (legacyDisplayName) return legacyDisplayName

    const uid = trimStr(fusionAccount.managedAccountId ?? fusionAccount.identityId) ?? ''
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
    error?: string,
    accountIdOverride?: string
): FusionReportAccount {
    const reportAccountId = accountIdOverride ?? fusionAccount.managedAccountId
    const row: FusionReportAccount = {
        accountName: getFusionReportAccountLabel(fusionAccount),
        accountUrl: urlContext.humanAccount(reportAccountId),
        accountSource: fusionAccount.sourceName,
        sourceType: (sourceType as FusionReportAccount['sourceType']) ?? SourceType.Authoritative,
        accountId: reportAccountId,
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

/**
 * Builds a synthetic fusion decision when all attribute scores are 100 (exact match),
 * skipping manual review (automatic assignment to the selected identity).
 *
 * @param fusionAccount - The fusion account being assigned
 * @param account - The managed account
 * @param identityId - The target identity ID
 * @returns Synthetic FusionDecision for automatic assignment
 */
export function createAutomaticAssignmentDecision(
    fusionAccount: FusionAccount,
    account: Account,
    identityId: string
): FusionDecision {
    const accountKey = getManagedAccountKeyFromAccount(account)
    assert(accountKey, 'Managed account missing composite key for automatic assignment decision')
    return {
        submitter: { id: 'system', email: '', name: 'System (automatic assignment)' },
        account: {
            id: accountKey,
            name: fusionAccount.name ?? account.name ?? '',
            sourceName: fusionAccount.sourceName,
            sourceId: readString(account, 'sourceId'),
            nativeIdentity: account.nativeIdentity ?? undefined,
        },
        newIdentity: false,
        identityId,
        comments: 'Automatically assigned: exact attribute match (all rules 100, none skipped)',
        finished: true,
        automaticAssignment: true,
    }
}

export function hasIdentityBackedMatches(fusionAccount: FusionAccount): boolean {
    return fusionAccount.fusionMatches.some((match) => (match.candidateType ?? 'identity') === 'identity')
}

export function hasNewUnmatchedPeerMatches(fusionAccount: FusionAccount): boolean {
    return fusionAccount.fusionMatches.some((match) => match.candidateType === 'new-unmatched')
}
