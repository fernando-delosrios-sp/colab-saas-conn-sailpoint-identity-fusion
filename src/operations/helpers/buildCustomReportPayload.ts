import { StdAccountListOutput } from '@sailpoint/connector-sdk'
import { FusionReportAccount, FusionReportMatch, FusionReportStats } from '../../services/fusionService/types'

export type MatchingStatus = 'matched' | 'non-matched' | 'review-error' | 'not-analyzed'

export type CustomReportRowCounter = Record<MatchingStatus, number>

export type CustomReportSummary = {
    type: 'custom:report:summary'
    command: 'custom:report'
    generatedAt: string
    rows: {
        sent: number
        matched: number
        nonMatched: number
        reviewErrors: number
        notAnalyzed: number
    }
    managedAccounts: {
        analyzed: number
        potentialMatches: number
        nonMatches: number
        reviewErrors: number
    }
    diagnostics: {
        warnings: number
        errors: number
        warningSamples: string[]
        errorSamples: string[]
    }
    stats?: FusionReportStats
    totalProcessingTime: string
}

type MatchingCandidate = {
    sourceAccountId?: string
    sourceAccountName: string
    sourceType?: 'authoritative' | 'record' | 'orphan'
    identityName: string
    identityId?: string
    identityUrl?: string
    isMatch: boolean
    scores?: FusionReportMatch['scores']
}

type MatchingPayload = {
    status: MatchingStatus
    analyzedAccounts: number
    matchedAccounts: number
    nonMatchedAccounts: number
    reviewErrorAccounts: number
    accountIds: string[]
    matches: MatchingCandidate[]
    sourceContext: {
        originSource?: unknown
        sources?: unknown
    }
    correlationContext: {
        accounts: string[]
        missingAccounts: string[]
        reviews: string[]
        statuses: string[]
    }
}

const toStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((x) => String(x))
    if (value === undefined || value === null) return []
    return [String(value)]
}

export const createCustomReportRowCounter = (): CustomReportRowCounter => ({
    matched: 0,
    'non-matched': 0,
    'review-error': 0,
    'not-analyzed': 0,
})

export const buildReportAccountIndex = (reportAccounts: FusionReportAccount[]): Map<string, FusionReportAccount[]> => {
    const index = new Map<string, FusionReportAccount[]>()
    for (const reportAccount of reportAccounts) {
        if (!reportAccount.accountId) continue
        const current = index.get(reportAccount.accountId) ?? []
        current.push(reportAccount)
        index.set(reportAccount.accountId, current)
    }
    return index
}

const deriveMatchingStatus = (reportAccounts: FusionReportAccount[]): MatchingStatus => {
    if (reportAccounts.length === 0) return 'not-analyzed'
    const hasError = reportAccounts.some((x) => Boolean(x.error))
    if (hasError) return 'review-error'
    const hasMatch = reportAccounts.some((x) => x.matches.length > 0)
    if (hasMatch) return 'matched'
    return 'non-matched'
}

const buildMatchingPayload = (account: StdAccountListOutput, reportAccounts: FusionReportAccount[]): MatchingPayload => {
    const attributes = account.attributes ?? {}
    const allMatches: MatchingCandidate[] = []
    let matchedAccounts = 0
    let reviewErrorAccounts = 0

    for (const reportAccount of reportAccounts) {
        if (reportAccount.error) {
            reviewErrorAccounts += 1
        }
        if (reportAccount.matches.length > 0) {
            matchedAccounts += 1
        }
        for (const match of reportAccount.matches) {
            allMatches.push({
                sourceAccountId: reportAccount.accountId,
                sourceAccountName: reportAccount.accountName,
                sourceType: reportAccount.sourceType,
                identityName: match.identityName,
                identityId: match.identityId,
                identityUrl: match.identityUrl,
                isMatch: match.isMatch,
                scores: match.scores,
            })
        }
    }

    const analyzedAccounts = reportAccounts.length
    const nonMatchedAccounts = analyzedAccounts - matchedAccounts - reviewErrorAccounts

    return {
        status: deriveMatchingStatus(reportAccounts),
        analyzedAccounts,
        matchedAccounts,
        nonMatchedAccounts: Math.max(nonMatchedAccounts, 0),
        reviewErrorAccounts,
        accountIds: reportAccounts.map((x) => x.accountId ?? '').filter(Boolean),
        matches: allMatches,
        sourceContext: {
            originSource: attributes.originSource,
            sources: attributes.sources,
        },
        correlationContext: {
            accounts: toStringArray(attributes.accounts),
            missingAccounts: toStringArray(attributes['missing-accounts']),
            reviews: toStringArray(attributes.reviews),
            statuses: toStringArray(attributes.statuses),
        },
    }
}

export const enrichISCAccountWithMatching = (
    account: StdAccountListOutput,
    reportIndex: Map<string, FusionReportAccount[]>
): { account: any; status: MatchingStatus } => {
    const attributes = account.attributes ?? {}
    const relatedIds = toStringArray(attributes.accounts)
    const relatedReportAccounts: FusionReportAccount[] = []

    for (const accountId of relatedIds) {
        const entries = reportIndex.get(accountId)
        if (!entries) continue
        relatedReportAccounts.push(...entries)
    }

    const matching = buildMatchingPayload(account, relatedReportAccounts)

    return {
        account: {
            ...account,
            attributes: {
                ...attributes,
                matching,
            },
        },
        status: matching.status,
    }
}

export const buildCustomReportSummary = (params: {
    sentRows: number
    rowCounter: CustomReportRowCounter
    reportAccounts: FusionReportAccount[]
    issueSummary: {
        warningCount: number
        errorCount: number
        warningSamples: string[]
        errorSamples: string[]
    }
    totalProcessingTime: string
    stats?: FusionReportStats
}): CustomReportSummary => {
    const potentialMatches = params.reportAccounts.filter((x) => x.matches.length > 0).length
    const reviewErrors = params.reportAccounts.filter((x) => Boolean(x.error)).length
    const nonMatches = params.reportAccounts.length - potentialMatches - reviewErrors

    return {
        type: 'custom:report:summary',
        command: 'custom:report',
        generatedAt: new Date().toISOString(),
        rows: {
            sent: params.sentRows,
            matched: params.rowCounter.matched,
            nonMatched: params.rowCounter['non-matched'],
            reviewErrors: params.rowCounter['review-error'],
            notAnalyzed: params.rowCounter['not-analyzed'],
        },
        managedAccounts: {
            analyzed: params.reportAccounts.length,
            potentialMatches,
            nonMatches: Math.max(nonMatches, 0),
            reviewErrors,
        },
        diagnostics: {
            warnings: params.issueSummary.warningCount,
            errors: params.issueSummary.errorCount,
            warningSamples: params.issueSummary.warningSamples,
            errorSamples: params.issueSummary.errorSamples,
        },
        stats: params.stats,
        totalProcessingTime: params.totalProcessingTime,
    }
}
