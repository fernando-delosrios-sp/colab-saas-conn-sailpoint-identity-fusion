import { StdAccountListOutput } from '@sailpoint/connector-sdk'
import { FusionReportAccount, FusionReportMatch, FusionReportStats } from '../../services/fusionService/types'
import { PendingReviewAccountContext } from '../../services/formService/formService'

export type MatchingStatus = 'matched' | 'deferred' | 'non-matched' | 'review-error' | 'not-analyzed'

export type CustomReportRowCounter = Record<MatchingStatus, number>

export type CustomReportSummary = {
    type: 'custom:report:summary'
    command: 'custom:report'
    generatedAt: string
    rows: {
        sent: number
        matched: number
        deferred: number
        nonMatched: number
        reviewErrors: number
        notAnalyzed: number
    }
    managedAccounts: {
        analyzed: number
        matches: number
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
    candidateType?: 'identity' | 'new-unmatched'
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
        originAccount?: unknown
        sources?: unknown
    }
    correlationContext: {
        accounts: string[]
        missingAccounts: string[]
        reviews: string[]
        statuses: string[]
    }
}

type ReviewForm = {
    formInstanceId: string
    url?: string
}

type ReviewReviewer = {
    id: string
    name: string
    email: string
}

type ReviewCandidate = {
    id: string
    name: string
    scores: FusionReportMatch['scores']
    attributes: Record<string, unknown>
}

type ReviewPayload = {
    pending: boolean
    forms: ReviewForm[]
    reviewers: ReviewReviewer[]
    candidates: ReviewCandidate[]
}

export type PendingReviewContextByAccountId = Map<string, PendingReviewAccountContext>

const toStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((x) => String(x))
    if (value === undefined || value === null) return []
    return [String(value)]
}

const EMPTY_REVIEW_PAYLOAD: ReviewPayload = { pending: false, forms: [], reviewers: [], candidates: [] }

export const createCustomReportRowCounter = (): CustomReportRowCounter => ({
    matched: 0,
    deferred: 0,
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
    const hasDeferred = reportAccounts.some((x) => Boolean(x.deferred))
    if (hasDeferred) return 'deferred'
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
                candidateType: match.candidateType,
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
            originAccount: attributes.originAccount,
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
    reportIndex: Map<string, FusionReportAccount[]>,
    pendingReviewByAccountId: PendingReviewContextByAccountId = new Map()
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
    const review = buildReviewPayload(relatedIds, relatedReportAccounts, pendingReviewByAccountId)

    return {
        account: {
            ...account,
            attributes: {
                ...attributes,
                matching,
                review,
            },
        },
        status: matching.status,
    }
}

const buildReviewPayload = (
    relatedIds: string[],
    relatedReportAccounts: FusionReportAccount[],
    pendingReviewByAccountId: PendingReviewContextByAccountId
): ReviewPayload => {
    if (relatedIds.length === 0 || pendingReviewByAccountId.size === 0) {
        return EMPTY_REVIEW_PAYLOAD
    }

    const forms = new Map<string, ReviewForm>()
    const reviewers = new Map<string, ReviewReviewer>()
    const candidateIds = new Set<string>()

    for (const accountId of relatedIds) {
        const context = pendingReviewByAccountId.get(accountId)
        if (!context) continue

        for (const form of context.forms ?? []) {
            if (!form?.formInstanceId) continue
            forms.set(form.formInstanceId, { formInstanceId: form.formInstanceId, url: form.url })
        }
        for (const reviewer of context.reviewers ?? []) {
            if (!reviewer?.id) continue
            reviewers.set(reviewer.id, {
                id: reviewer.id,
                name: reviewer.name ?? reviewer.id,
                email: reviewer.email ?? '',
            })
        }
        for (const candidateId of context.candidateIds ?? []) {
            if (candidateId) candidateIds.add(candidateId)
        }
    }

    const candidates = buildReviewCandidates(Array.from(candidateIds), relatedReportAccounts)
    const formEntries = Array.from(forms.values())
    const reviewerEntries = Array.from(reviewers.values())

    return {
        pending: formEntries.length > 0,
        forms: formEntries,
        reviewers: reviewerEntries,
        candidates,
    }
}

const buildReviewCandidates = (
    candidateIds: string[],
    relatedReportAccounts: FusionReportAccount[]
): ReviewCandidate[] => {
    if (candidateIds.length === 0) return []

    const matchByIdentityId = new Map<string, FusionReportMatch[]>()
    for (const reportAccount of relatedReportAccounts) {
        for (const match of reportAccount.matches) {
            if (!match.identityId) continue
            const list = matchByIdentityId.get(match.identityId) ?? []
            list.push(match)
            matchByIdentityId.set(match.identityId, list)
        }
    }

    return candidateIds.map((candidateId) => {
        const matches = matchByIdentityId.get(candidateId) ?? []
        const first = matches[0]
        const scores = first?.scores ?? []

        return {
            id: candidateId,
            name: first?.identityName ?? candidateId,
            scores,
            attributes: {},
        }
    })
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
    const accountsWithMatches = params.reportAccounts.filter((x) => x.matches.length > 0).length
    const reviewErrors = params.reportAccounts.filter((x) => Boolean(x.error)).length
    const nonMatches = params.reportAccounts.length - accountsWithMatches - reviewErrors

    return {
        type: 'custom:report:summary',
        command: 'custom:report',
        generatedAt: new Date().toISOString(),
        rows: {
            sent: params.sentRows,
            matched: params.rowCounter.matched,
            deferred: params.rowCounter.deferred,
            nonMatched: params.rowCounter['non-matched'],
            reviewErrors: params.rowCounter['review-error'],
            notAnalyzed: params.rowCounter['not-analyzed'],
        },
        managedAccounts: {
            analyzed: params.reportAccounts.length,
            matches: accountsWithMatches,
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
