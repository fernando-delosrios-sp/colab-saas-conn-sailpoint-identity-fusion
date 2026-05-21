import { FusionAccount } from '../../model/account'
import {
    buildIdentityConflictWarningsFromMap,
    buildMinimalFusionReportAccount,
    fusionReportMatchCandidateAccountFields,
    mapScoreReportsForFusionReport,
} from './helpers'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { FusionReport, FusionReportAccount, FusionReportStats } from './types'
import { UrlContext } from '../../utils/url'
import { SourceInfo } from '../sourceService'

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
    resolveReportAccountId: (account: FusionAccount) => string | undefined
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

function buildMatchAccounts(state: FusionReportState): FusionReportAccount[] {
    const accounts: FusionReportAccount[] = []

    for (const fusionAccount of state.matchAccounts) {
        const fusionMatches = fusionAccount.fusionMatches
        if (!fusionMatches || fusionMatches.length === 0) continue

        const matches = fusionMatches.map((match) => ({
            ...fusionReportMatchCandidateAccountFields(match),
            identityName: match.identityName,
            identityId: match.identityId,
            identityUrl: state.urlContext.identity(match.identityId),
            isMatch: true,
            candidateType: match.candidateType,
            exact: isExactAttributeMatchScores(match.scores),
            scores: mapScoreReportsForFusionReport(match.scores),
        }))

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
                state.resolveReportAccountId(fusionAccount)
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
