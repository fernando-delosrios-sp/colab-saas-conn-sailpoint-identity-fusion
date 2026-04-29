import { StdAccountListOutput } from '@sailpoint/connector-sdk'
import { FusionReportAccount, FusionReportMatch, FusionReportStats } from '../../services/fusionService/types'
import { PendingReviewAccountContext } from '../../services/formService/formService'
import { createUrlContext } from '../../utils/url'
import { readPathString } from '../../utils/safeRead'

/**
 * Row-level outcome for the ISC account in this run.
 *
 * - 'matched' / 'deferred' / 'non-matched' describe outcomes for managed accounts
 *   with a Match attempt in this run that relate to the ISC account.
 * - 'review-error' reflects form creation / review processing errors.
 * - 'not-analyzed' is reserved for ISC accounts with no related Match attempts
 *   in this run (existing Fusion-only context).
 */
export type MatchingStatus = 'matched' | 'deferred' | 'non-matched' | 'review-error' | 'not-analyzed'

export type DryRunRowCounter = Record<MatchingStatus, number>

/** Mirrors the boolean flags passed in the `custom:dryrun` command input. */
export type DryRunInputOptions = {
    includeExisting: boolean
    includeNonMatched: boolean
    includeMatched: boolean
    includeExact: boolean
    includeDeferred: boolean
    includeReview: boolean
    includeDecisions: boolean
    writeToDisk: boolean
    sendReportTo?: string[]
}

/**
 * How many emitted detail rows contributed to each include* bucket.
 * A single row can increment multiple buckets when it matches several categories.
 */
export type DryRunOptionEmitCounter = {
    includeExisting: number
    includeNonMatched: number
    includeMatched: number
    includeExact: number
    includeDeferred: number
    includeReview: number
    includeDecisions: number
    reviewErrors: number
}

export const createDryRunOptionEmitCounter = (): DryRunOptionEmitCounter => ({
    includeExisting: 0,
    includeNonMatched: 0,
    includeMatched: 0,
    includeExact: 0,
    includeDeferred: 0,
    includeReview: 0,
    includeDecisions: 0,
    reviewErrors: 0,
})

export type DryRunSummary = {
    type: 'custom:dryrun:summary'
    command: 'custom:dryrun'
    generatedAt: string
    options: DryRunInputOptions
    emitted: {
        /** Distinct detail rows written or streamed (each row counted once). */
        totalRows: number
        /** When `includeExisting` was true: same as `totals.fusionAccountsExisting`. Otherwise 0 from row counts. */
        includeExisting: number
        includeNonMatched: number
        includeMatched: number
        includeExact: number
        includeDeferred: number
        includeReview: number
        includeDecisions: number
        reviewErrors: number
    }
    totals: {
        fusionAccountsTotal: number
        fusionAccountsExisting: number
        /** Managed accounts for which Match was attempted in this dry-run (size of the report account slice). */
        matchAttempts: number
        /** Non-deferred match attempts with at least one match. */
        matches: number
        /** Deferred match attempts that still have at least one match. */
        deferredMatches: number
        /** Non-deferred match attempts with no matches. */
        nonMatches: number
        existingFusionForms: number
        existingFusionDecisions: number
    }
    diagnostics: {
        warnings: number
        errors: number
        warningSamples: string[]
        errorSamples: string[]
    }
    stats?: FusionReportStats
    totalProcessingTime: string
    /** When `writeToDisk` was true: absolute path of the pretty-printed JSON detail file on the connector host. */
    reportOutputPath?: string
    /** When `writeToDisk` was true: absolute path of the generated HTML report on the connector host. */
    reportHtmlOutputPath?: string
    writeToDisk?: boolean
}

/** Dry-run wire: fusion candidate only (`identity` vs same-aggregation `deferred`). */
type MatchingCandidate = {
    identityName: string
    identityId?: string
    identityUrl?: string
    accountId?: string
    accountName?: string
    isMatch: boolean
    candidateType?: 'identity' | 'deferred'
    exact?: boolean
    scores?: Array<
        Omit<NonNullable<FusionReportMatch['scores']>[number], 'fusionScore'> & { threshold?: number | string }
    >
}

type MatchingPayload = {
    status: MatchingStatus
    /** Sum of fusion identity comparisons for related managed accounts in this run. */
    matchAttempts: number
    /** Total match candidates found (length of `matches`). */
    matchedAccounts: number
    reviewErrorAccounts: number
    accountIds: string[]
    matches: MatchingCandidate[]
    sourceContext: {
        originSource?: unknown
        originAccount?: unknown
        sources?: unknown
    }
    /** Omitted when all arrays are empty (e.g. orphan deferred stubs have no ISC correlation context). */
    correlationContext?: {
        accounts: string[]
        missingAccounts: string[]
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

export const createDryRunRowCounter = (): DryRunRowCounter => ({
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

const wireCandidateType = (ct: FusionReportMatch['candidateType']): MatchingCandidate['candidateType'] => {
    if (ct === 'new-unmatched') return 'deferred'
    return 'identity'
}

const mapScoresToThresholdWire = (
    scores: FusionReportMatch['scores'] | undefined
): MatchingCandidate['scores'] =>
    scores?.map((s) => {
        const { fusionScore, ...rest } = s
        return fusionScore !== undefined ? { ...rest, threshold: fusionScore } : rest
    })

const deriveMatchingStatus = (reportAccounts: FusionReportAccount[]): MatchingStatus => {
    // No report accounts linked to this ISC account in this run -> existing Fusion-only.
    if (reportAccounts.length === 0) return 'not-analyzed'
    const hasDeferred = reportAccounts.some((x) => Boolean(x.deferred))
    if (hasDeferred) return 'deferred'
    const hasError = reportAccounts.some((x) => Boolean(x.error))
    if (hasError) return 'review-error'
    const hasMatch = reportAccounts.some((x) => x.matches.length > 0)
    if (hasMatch) return 'matched'
    return 'non-matched'
}

const buildMatchingPayload = (
    account: StdAccountListOutput,
    reportAccounts: FusionReportAccount[],
    isOrphanStub = false,
    baseurl?: string,
    resolveReportAccountId?: (accountId?: string) => string | undefined
): MatchingPayload => {
    const attributes = account.attributes ?? {}
    const allMatches: MatchingCandidate[] = []
    let reviewErrorAccounts = 0
    const urlCtx = baseurl?.trim() ? createUrlContext(baseurl) : undefined

    for (const reportAccount of reportAccounts) {
        if (reportAccount.error) {
            reviewErrorAccounts += 1
        }
        for (const match of reportAccount.matches) {
            let identityUrl = match.identityUrl
            if (!identityUrl && urlCtx) {
                if (match.identityId) {
                    identityUrl = urlCtx.identity(match.identityId)
                }
                if (!identityUrl && match.accountId) {
                    const reportAccountId = resolveReportAccountId?.(match.accountId) ?? match.accountId
                    identityUrl = urlCtx.humanAccount(reportAccountId)
                }
            }
            allMatches.push({
                identityName: match.identityName,
                identityId: match.identityId,
                identityUrl,
                accountId: match.accountId,
                accountName: match.accountName,
                isMatch: match.isMatch,
                candidateType: wireCandidateType(match.candidateType),
                exact: match.exact,
                scores: mapScoresToThresholdWire(match.scores),
            })
        }
    }

    const matchAttempts = reportAccounts.reduce((sum, ra) => sum + (ra.fusionIdentityComparisons ?? 0), 0)
    const matchedAccounts = allMatches.length

    const status = deriveMatchingStatus(reportAccounts)

    const correlationAccounts = toStringArray(attributes.accounts)
    const correlationMissing = toStringArray(attributes['missing-accounts'])
    const correlationStatuses = toStringArray(attributes.statuses)
    // Orphan-deferred stubs are synthetic records with no real ISC correlation history.
    // Their accounts[] is already captured in matchingStatus.accountIds — suppress the duplicate.
    const hasCorrelationContext =
        !isOrphanStub &&
        (correlationAccounts.length > 0 || correlationMissing.length > 0 || correlationStatuses.length > 0)

    return {
        status,
        matchAttempts,
        matchedAccounts,
        reviewErrorAccounts,
        accountIds: reportAccounts.map((x) => x.accountId ?? '').filter(Boolean),
        matches: allMatches,
        sourceContext: {
            originSource: attributes.originSource,
            originAccount: attributes.originAccount,
            sources: attributes.sources,
        },
        ...(hasCorrelationContext
            ? {
                  correlationContext: {
                      accounts: correlationAccounts,
                      missingAccounts: correlationMissing,
                      statuses: correlationStatuses,
                  },
              }
            : {}),
    }
}

export const enrichISCAccountWithMatching = (
    account: StdAccountListOutput,
    reportIndex: Map<string, FusionReportAccount[]>,
    pendingReviewByAccountId: PendingReviewContextByAccountId = new Map(),
    baseurl?: string,
    resolveReportAccountId?: (accountId?: string) => string | undefined
): { account: any; status: MatchingStatus } => {
    const attributes = account.attributes ?? {}
    const relatedIds = toStringArray(attributes.accounts)
    const relatedReportAccounts: FusionReportAccount[] = []

    for (const accountId of relatedIds) {
        const entries = reportIndex.get(accountId)
        if (!entries) continue
        relatedReportAccounts.push(...entries)
    }

    const isOrphanStub = (readPathString(account, ['key', 'simple', 'id']) ?? '').startsWith('orphan-deferred:')
    const matching = buildMatchingPayload(account, relatedReportAccounts, isOrphanStub, baseurl, resolveReportAccountId)
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

export const buildDryRunSummary = (params: {
    sentRows: number
    optionEmitCounter: DryRunOptionEmitCounter
    reportOptions: DryRunInputOptions
    reportAccounts: FusionReportAccount[]
    issueSummary: {
        warningCount: number
        errorCount: number
        warningSamples: string[]
        errorSamples: string[]
    }
    totalProcessingTime: string
    stats?: FusionReportStats
    /** Optional review decisions array backing existingDecisions; falls back to stats if omitted. */
    fusionReviewDecisionsCount?: number
    writeToDisk?: boolean
    reportOutputPath?: string
    reportHtmlOutputPath?: string
}): DryRunSummary => {
    const deferredMatchesCount = params.reportAccounts.filter(
        (x) => Boolean(x.deferred) && x.matches.length > 0
    ).length

    // Run-wide totals (dry-run account slice + fusion stats)
    const stats = params.stats ?? {}
    const totalFusionAccounts = stats.totalFusionAccounts ?? stats.fusionAccountsFound ?? 0
    /** Same value as `totals.fusionAccountsExisting` — authoritative fusion account inventory for this run. */
    const existingFusionAccounts = stats.fusionAccountsFound ?? totalFusionAccounts
    const matches = params.reportAccounts.filter((x) => x.matches.length > 0 && !x.deferred).length
    const nonMatches = params.reportAccounts.filter((x) => !x.deferred && x.matches.length === 0).length
    const existingForms = stats.fusionReviewInstancesFound ?? stats.fusionReviewsFound ?? 0
    const existingDecisions =
        params.fusionReviewDecisionsCount ??
        stats.fusionReviewsProcessed ??
        (stats.fusionReviewDecisionsAuthoritative ?? 0) +
            (stats.fusionReviewDecisionsRecord ?? 0) +
            (stats.fusionReviewDecisionsOrphan ?? 0)

    return {
        type: 'custom:dryrun:summary',
        command: 'custom:dryrun',
        generatedAt: new Date().toISOString(),
        options: { ...params.reportOptions },
        emitted: {
            totalRows: params.sentRows,
            includeExisting: params.reportOptions.includeExisting
                ? existingFusionAccounts
                : params.optionEmitCounter.includeExisting,
            includeNonMatched: params.optionEmitCounter.includeNonMatched,
            includeMatched: params.optionEmitCounter.includeMatched,
            includeExact: params.optionEmitCounter.includeExact,
            includeDeferred: params.optionEmitCounter.includeDeferred,
            includeReview: params.optionEmitCounter.includeReview,
            includeDecisions: params.optionEmitCounter.includeDecisions,
            reviewErrors: params.optionEmitCounter.reviewErrors,
        },
        totals: {
            fusionAccountsTotal: totalFusionAccounts,
            fusionAccountsExisting: existingFusionAccounts,
            matchAttempts: params.reportAccounts.length,
            matches,
            deferredMatches: deferredMatchesCount,
            nonMatches,
            existingFusionForms: existingForms,
            existingFusionDecisions: existingDecisions,
        },
        diagnostics: {
            warnings: params.issueSummary.warningCount,
            errors: params.issueSummary.errorCount,
            warningSamples: params.issueSummary.warningSamples,
            errorSamples: params.issueSummary.errorSamples,
        },
        stats: params.stats,
        totalProcessingTime: params.totalProcessingTime,
        ...(params.writeToDisk
            ? {
                  writeToDisk: true as const,
                  reportOutputPath: params.reportOutputPath,
                  reportHtmlOutputPath: params.reportHtmlOutputPath,
              }
            : {}),
    }
}
