import { FusionAccount } from '../../model/account'
import {
    buildIdentityConflictWarningsFromMap,
    buildMinimalFusionReportAccount,
    fusionReportMatchCandidateAccountFields,
    mapScoreReportsForFusionReport,
} from './helpers'
import { isExactAttributeMatchScores } from '../matchingService/exactMatch'
import { COMBINED_SCORE_ROW_ATTRIBUTE } from '../matchingService/matchingService'
import { identityMatchesForReview } from '../matchingService/matchingHelpers'
import { FusionReport, FusionReportAccount, FusionReportMatch, FusionReportStats } from './types'
import type { MatchingResultsSnapshot, MatchingResultsSweepSummary } from '../recordingService/matchingResultsSnapshot'
import { UrlContext } from '../../utils/url'
import { SourceInfo, SourceService } from '../sourceService'
import { resolveReportAccountId } from './reportAccountResolver'
import { resolveFusionMaxCandidatesForForm } from '../../data/config'
import { MatchCandidateType } from '../matchingService/types'

export interface FusionReportState {
    conflictingFusionIdentityAccounts: Map<string, Map<string, string>>
    matchAccounts: FusionAccount[]
    failedMatchingAccounts: FusionReportAccount[]
    deferredMatchReportData: FusionReportAccount[]
    analyzedNonMatchReportData: FusionReportAccount[]
    newManagedAccountsCount: number
    urlContext: UrlContext
    sourcesByName: Map<string, SourceInfo>
    reportAttributes: string[]
    fusionIdentityComparisonsByAccount: WeakMap<FusionAccount, number>
    sources: SourceService
    fusionEnableAutoMerge: boolean
    fusionAutoMergeScore?: number
    fusionMaxCandidatesForForm?: number
}

export function buildFusionReport(
    state: FusionReportState,
    includeNonMatches: boolean = false,
    stats?: FusionReportStats
): FusionReport {
    const warnings = buildIdentityConflictWarningsFromMap(state.conflictingFusionIdentityAccounts)

    const matchAccounts = buildMatchAccounts(state)
    const { failedAccounts, deferredAccounts } = prepareFailedAndDeferredAccounts(state)
    const nonMatchAccounts = includeNonMatches ? buildNonMatchAccounts(state) : []

    const allAccounts = [
        ...matchAccounts,
        ...deferredAccounts,
        ...failedAccounts,
        ...nonMatchAccounts,
    ]
    const matchAccountCount = matchAccounts.length + deferredAccounts.length

    return {
        accounts: allAccounts,
        totalAccounts: state.newManagedAccountsCount,
        matches: matchAccountCount,
        reportDate: new Date(),
        stats,
        warnings,
    }
}

function mapFusionMatchToReportCandidate(
    match: ReturnType<typeof identityMatchesForReview>[number],
    state: FusionReportState
): FusionReportMatch {
    const combinedReport = match.scores.find((s) => s.attribute === COMBINED_SCORE_ROW_ATTRIBUTE)
    const score = combinedReport?.score ?? 0
    const auto =
        state.fusionEnableAutoMerge &&
        state.fusionAutoMergeScore !== undefined &&
        score >= state.fusionAutoMergeScore

    return {
        ...fusionReportMatchCandidateAccountFields(match),
        identityName: match.identityName,
        identityId: match.identityId,
        identityUrl: state.urlContext.identity(match.identityId),
        isMatch: true,
        candidateType: match.candidateType ?? MatchCandidateType.Identity,
        exact: isExactAttributeMatchScores(match.scores),
        auto,
        manual: !auto,
        scores: mapScoreReportsForFusionReport(match.scores),
    }
}

function buildMatchAccounts(state: FusionReportState): FusionReportAccount[] {
    const accounts: FusionReportAccount[] = []

    for (const fusionAccount of state.matchAccounts) {
        const maxCandidates = resolveFusionMaxCandidatesForForm(state.fusionMaxCandidatesForForm)
        const fusionMatches = identityMatchesForReview(fusionAccount, maxCandidates)
        if (fusionMatches.length === 0) continue

        const matches = fusionMatches.map((match) => mapFusionMatchToReportCandidate(match, state))

        // Release fusionIdentity refs after extracting report data (on-demand report path)
        fusionAccount.clearFusionIdentityReferences()

        const sourceInfo = state.sourcesByName.get(fusionAccount.sourceName)
        accounts.push({
            ...buildMinimalFusionReportAccount(
                fusionAccount,
                state.urlContext,
                sourceInfo?.sourceType,
                state.reportAttributes,
                undefined,
                resolveReportAccountId(fusionAccount, state.sources)
            ),
            fusionIdentityComparisons: state.fusionIdentityComparisonsByAccount.get(fusionAccount) ?? 0,
            matches,
        })
    }

    accounts.sort((a, b) => a.accountName.localeCompare(b.accountName))
    return accounts
}

function prepareFailedAndDeferredAccounts(state: FusionReportState): {
    failedAccounts: FusionReportAccount[]
    deferredAccounts: FusionReportAccount[]
} {
    state.failedMatchingAccounts.sort((a, b) => a.accountName.localeCompare(b.accountName))

    state.deferredMatchReportData.sort((a, b) => a.accountName.localeCompare(b.accountName))
    for (const deferredAccount of state.deferredMatchReportData) {
        deferredAccount.deferred = true
    }

    return {
        failedAccounts: state.failedMatchingAccounts,
        deferredAccounts: state.deferredMatchReportData,
    }
}

function buildNonMatchAccounts(state: FusionReportState): FusionReportAccount[] {
    const nonMatchAccounts = [...state.analyzedNonMatchReportData]
    nonMatchAccounts.sort((a, b) => a.accountName.localeCompare(b.accountName))
    return nonMatchAccounts
}

/** Builds a recording artifact snapshot from tracker state without clearing the tracker. */
export function buildMatchingResultsSnapshot(
    state: FusionReportState,
    options?: {
        sweepSummary?: MatchingResultsSweepSummary
        stepId?: string
        operation?: string
    }
): MatchingResultsSnapshot {
    const identityMatches = buildMatchAccounts(state)
    const { failedAccounts, deferredAccounts } = prepareFailedAndDeferredAccounts(state)
    const nonMatches = buildNonMatchAccounts(state)

    return {
        version: '1.0.0',
        recordedAt: new Date().toISOString(),
        operation: options?.operation ?? 'accountList',
        stepId: options?.stepId,
        sweepSummary: options?.sweepSummary,
        identityMatches,
        deferredMatches: deferredAccounts,
        nonMatches,
        failedMatches: failedAccounts,
    }
}





