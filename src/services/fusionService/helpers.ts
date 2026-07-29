import { FusionAccount } from '../../model/account'
import { SourceType } from '../../model/config'
import { pickAttributes } from '../../utils/attributes'
import { trimStr } from '../../utils/safeRead'
import { roundMetric2 } from '../../utils/numbers'
import { UrlContext } from '../../utils/url'
import type { FusionMatch, ScoreReport } from '../matchingService/types'
import { isCompositeManagedAccountKey, normalizeCompositeManagedAccountKey } from '../../model/managedAccountKey'
import {
    FusionReportAccount,
    FusionReportIdentityConflictOccurrence,
    FusionReportMatch,
    FusionReportScore,
    FusionReportWarnings,
} from './types'
import { isExactAttributeMatchScores } from '../matchingService/exactMatch'
import { anchorDeferredMatchesForReview, rankFusionMatchesForReview } from '../matchingService/matchPresentation'
import { MatchCandidateType } from '../matchingService/types'
import { FusionRun } from '../../model/fusionRun'
import { SourceService } from '../sourceService'
import { resolveReportAccountIdValue } from './reportAccountResolver'


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
 * Build review-email match rows using the same label and score mapping as dry-run reports.
 */
export function buildFusionReportMatchesForReviewEmail(
    matches: FusionMatch[],
    urlContext: UrlContext,
    maxCandidates?: number
): FusionReportMatch[] {
    const ordered = maxCandidates ? rankFusionMatchesForReview(matches).slice(0, maxCandidates) : rankFusionMatchesForReview(matches)

    return ordered.map((match) => {
        const fields = fusionReportMatchCandidateAccountFields(match)
        const identityId = trimStr(match.identityId ?? match.fusionIdentity?.identityId) ?? undefined
        const identityName = fields.accountName || trimStr(match.identityName) || identityId || 'Unknown'

        return {
            ...fields,
            identityName,
            identityId,
            identityUrl: identityId ? urlContext.identity(identityId) : undefined,
            isMatch: true,
            exact: isExactAttributeMatchScores(match.scores),
            scores: mapScoreReportsForFusionReport(match.scores),
        }
    })
}

/**
 * Stable key for identity conflict tracking when managedKey may be missing.
 */
export function getFusionIdentityConflictTrackingKey(fusionAccount: FusionAccount): string {
    const managedKey = fusionAccount.managedKeyOrUndefined
    const trimmedManagedKey = trimStr(managedKey)
    if (trimmedManagedKey) {
        return trimmedManagedKey
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
        const accountId = trimStr(fi.identityId ?? fi.managedKeyOrUndefined)
        return { accountId, accountName: getFusionReportAccountLabel(fi) }
    }
    const id = trimStr(match.identityId) ?? ''
    return {
        accountId: id || undefined,
        accountName: match.identityName,
    }
}

/** Deferred-match candidate fields prefer the managed account key over any linked identity id. */
function fusionReportDeferredMatchCandidateFields(
    match: FusionMatch
): Pick<FusionReportMatch, 'accountId' | 'accountName'> {
    const fi = match.fusionIdentity
    if (fi) {
        const accountId = trimStr(fi.managedKeyOrUndefined ?? fi.managedAccountId)
        return { accountId, accountName: getFusionReportAccountLabel(fi) }
    }
    const id = trimStr(match.identityId) ?? ''
    return {
        accountId: id || undefined,
        accountName: match.identityName,
    }
}

function resolveDeferredMatchCandidateUrl(
    match: FusionMatch,
    urlContext: UrlContext,
    sources: SourceService
): string | undefined {
    const fields = fusionReportDeferredMatchCandidateFields(match)
    const fi = match.fusionIdentity
    const deferredCandidateIdentityId = fi?.identityId
    const managedKey = fi?.managedKeyOrUndefined ?? fi?.managedAccountId ?? fields.accountId
    const managedAccountReportId = resolveReportAccountIdValue(managedKey, sources)
    if (managedAccountReportId) return urlContext.humanAccount(managedAccountReportId)
    if (deferredCandidateIdentityId) return urlContext.identity(deferredCandidateIdentityId)
    return undefined
}

export function buildDeferredMatchReportRows(
    fusionAccount: FusionAccount,
    run: FusionRun,
    maxCandidates: number | undefined,
    urlContext: UrlContext,
    sources: SourceService
): FusionReportMatch[] {
    return anchorDeferredMatchesForReview(fusionAccount, run, maxCandidates).map((match) => ({
        ...fusionReportDeferredMatchCandidateFields(match),
        identityName: match.identityName,
        identityId: match.fusionIdentity?.identityId,
        identityUrl: resolveDeferredMatchCandidateUrl(match, urlContext, sources),
        isMatch: true,
        candidateType: MatchCandidateType.Deferred,
        exact: isExactAttributeMatchScores(match.scores),
        scores: mapScoreReportsForFusionReport(match.scores),
    }))
}

export function getFusionReportAccountLabel(fusionAccount: FusionAccount): string {
    const displayLabel = trimStr(fusionAccount.identityAlias) ?? ''
    if (displayLabel) return displayLabel

    const aliasLabel = trimStr(fusionAccount.identityName) ?? ''
    if (aliasLabel) return aliasLabel

    const sourceTitle = trimStr(fusionAccount.name) ?? ''
    if (sourceTitle) return sourceTitle

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
    const accountUrlId = accountIdOverride && !isCompositeManagedAccountKey(accountIdOverride)
        ? accountIdOverride
        : undefined
    const row: FusionReportAccount = {
        accountName: getFusionReportAccountLabel(fusionAccount),
        accountUrl: urlContext.humanAccount(accountUrlId),
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
        const managedKeys = Array.from(accounts.keys()).sort((a, b) => a.localeCompare(b))
        const accountNames = Array.from(new Set(accounts.values())).sort((a, b) => a.localeCompare(b))
        occurrences.push({
            identityId,
            accountCount: managedKeys.length,
            accountNames,
            managedKeys,
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

/** Managed keys to skip generic blend-history when a decision already recorded history for that account. */
export function skipBlendHistoryKeysForDecisionAccountId(
    decisionAccountId: string | undefined | null
): ReadonlySet<string> | undefined {
    const normalized = normalizeCompositeManagedAccountKey(trimStr(decisionAccountId) ?? '')
    return normalized ? new Set([normalized]) : undefined
}


