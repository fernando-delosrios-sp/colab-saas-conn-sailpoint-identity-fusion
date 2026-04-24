import { ServiceRegistry } from '../../services/serviceRegistry'
import { FusionAccount } from '../../model/account'
import {
    AggregationStats,
    FusionReport,
    FusionReportDecision,
    FusionReportStats,
} from '../../services/fusionService/types'
import { FusionDecision } from '../../model/form'
import { SourceType } from '../../model/config'
import { createUrlContext } from '../../utils/url'
import { readString } from '../../utils/safeRead'
import { setupPhase, fetchPhase, refreshPhase, processPhase, uniqueAttributesPhase } from './corePipeline'

const toReportDecision = (
    decision: FusionDecision,
    resolveSourceType?: (sourceName?: string) => SourceType | undefined,
    resolveReviewerName?: (reviewerId?: string) => string | undefined,
    resolveReviewerUrl?: (reviewerId?: string) => string | undefined,
    resolveAccountUrl?: (accountId?: string) => string | undefined,
    resolveIdentityContext?: (identityId?: string) => { selectedIdentityName?: string; selectedIdentityUrl?: string }
): FusionReportDecision => {
    const sourceType =
        decision.sourceType ?? resolveSourceType?.(decision.account.sourceName) ?? SourceType.Authoritative
    const isNoMatchSource = sourceType === SourceType.Record || sourceType === SourceType.Orphan
    const decisionType = decision.newIdentity
        ? isNoMatchSource
            ? 'confirm-no-match'
            : 'create-new-identity'
        : 'assign-existing-identity'

    const decisionLabel =
        decisionType === 'assign-existing-identity'
            ? 'Assigned to existing identity'
            : decisionType === 'create-new-identity'
              ? 'Created new identity'
              : 'Confirmed no match'

    const selectedIdentityContext = resolveIdentityContext?.(decision.identityId) ?? {}
    const reviewerName =
        decision.submitter.name || resolveReviewerName?.(decision.submitter.id) || decision.submitter.id
    const selectedIdentityName =
        decision.identityName || selectedIdentityContext.selectedIdentityName || decision.identityId
    const correlatedIdentityContext = resolveIdentityContext?.(readString(decision, 'correlatedIdentityId')) ?? {}
    const correlatedAccountName = correlatedIdentityContext.selectedIdentityName

    const reviewerId = decision.submitter.id
    const reviewerUrl = reviewerId && reviewerId !== 'system' ? resolveReviewerUrl?.(reviewerId) : undefined

    return {
        reviewerId,
        reviewerName,
        reviewerUrl,
        reviewerEmail: decision.submitter.email || undefined,
        accountId: decision.account.id,
        accountName: correlatedAccountName || decision.account.name || decision.account.id,
        accountUrl: resolveAccountUrl?.(decision.account.id),
        accountSource: decision.account.sourceName || '',
        sourceType,
        decision: decisionType,
        decisionLabel,
        selectedIdentityId: decision.identityId || undefined,
        selectedIdentityName,
        selectedIdentityUrl: selectedIdentityContext.selectedIdentityUrl,
        comments: decision.comments || undefined,
        formUrl: decision.formUrl || undefined,
        automaticAssignment: decision.automaticAssignment === true ? true : undefined,
    }
}

/**
 * Self-contained fetch + process for standalone report triggers (e.g. reportAction).
 *
 * Runs the full dry-run pipeline (setup → fetch → process) so that all fusion
 * accounts, identities, and managed accounts are in memory — matching exactly
 * what accountList phases 1–3 do, but without persistence or side-effects.
 *
 * The messaging sender is fetched separately here because fetchPhase skips it
 * for non-persistent runs, but it is required to send the report email.
 *
 * @returns AggregationStats ready to pass to generateReport.
 */
export async function fetchAndProcessForReport(serviceRegistry: ServiceRegistry): Promise<AggregationStats> {
    const { log, messaging } = serviceRegistry
    const options = { mode: { kind: 'dry-run' } as const }
    const timer = log.timer()

    const shouldContinue = await setupPhase(serviceRegistry, undefined, options)
    if (!shouldContinue) {
        // Reset flag was set — return empty stats; caller should check or ignore report
        return { identitiesFound: 0, managedAccountsFound: 0, totalProcessingTime: timer.totalElapsed() }
    }
    timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

    const fetchResult = await fetchPhase(serviceRegistry, options)

    // Fetch sender separately — fetchPhase omits it for dry-run, but the report email needs it
    await messaging.fetchSender()
    timer.phase('PHASE 2: Fetching data in parallel', 'info', 'Fetch')

    await refreshPhase(serviceRegistry, options)
    timer.phase('PHASE 3: Refresh (fusion accounts)', 'info', 'Refresh')

    await processPhase(serviceRegistry, options)
    timer.phase('PHASE 4: Process (identities, managed accounts, form reconciliation)', 'info', 'Process')

    await uniqueAttributesPhase(serviceRegistry, options)
    timer.phase('PHASE 5: Unique attributes', 'info', 'Unique attributes')

    return {
        identitiesFound: fetchResult.identitiesFound,
        managedAccountsFound: fetchResult.managedAccountsFound,
        managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
        managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
        totalProcessingTime: timer.totalElapsed(),
        phaseTiming: timer.getPhaseBreakdown(),
    }
}

export const hydrateIdentitiesForReportDecisions = async (serviceRegistry: ServiceRegistry): Promise<void> => {
    const { forms, identities } = serviceRegistry
    const finishedDecisions = forms.finishedFusionDecisions ?? []
    // Ensure we can render reviewer/selected identity display names even if the identity cache was cleared earlier
    // (e.g. std:account:list clears identities for memory before report phase).
    const idsToHydrate = new Set<string>()
    for (const d of finishedDecisions) {
        if (d?.submitter?.id) idsToHydrate.add(d.submitter.id)
        if (d?.identityId) idsToHydrate.add(d.identityId)
    }
    const missing = [...idsToHydrate].filter((id) => !identities.getIdentityById(id))
    const limiters = serviceRegistry.client.getLimiters()
    await limiters.runAll(missing, (id) =>
        // Best-effort: hydrate display names for reporting
        identities.fetchIdentityById(id).catch(() => {})
    )
}

export const buildFusionReviewDecisions = (serviceRegistry: ServiceRegistry): FusionReportDecision[] => {
    const { forms, identities, sources } = serviceRegistry
    const finishedDecisions = forms.finishedFusionDecisions ?? []
    const urlContext = createUrlContext(serviceRegistry.config.baseurl)
    const resolveSourceType = (sourceName?: string): SourceType | undefined =>
        sources.getSourceByNameSafe(sourceName)?.sourceType
    const resolveReviewerName = (reviewerId?: string): string | undefined => {
        if (!reviewerId) return undefined
        const reviewer = identities.getIdentityById(reviewerId)
        return (
            (reviewer as any)?.displayName ||
            (reviewer as any)?.attributes?.displayName ||
            (reviewer as any)?.name ||
            undefined
        )
    }
    const resolveReviewerUrl = (reviewerId?: string): string | undefined =>
        reviewerId ? urlContext.identity(reviewerId) : undefined
    const resolveAccountUrl = (accountId?: string): string | undefined =>
        accountId ? urlContext.humanAccount(accountId) : undefined
    const resolveIdentityContext = (
        identityId?: string
    ): { selectedIdentityName?: string; selectedIdentityUrl?: string } => {
        if (!identityId) return {}
        const identity = identities.getIdentityById(identityId)
        const selectedIdentityName =
            (identity as any)?.displayName ||
            (identity as any)?.attributes?.displayName ||
            (identity as any)?.name ||
            identityId
        return {
            selectedIdentityName,
            selectedIdentityUrl: urlContext.identity(identityId),
        }
    }

    return finishedDecisions.map((decision) =>
        toReportDecision(
            decision,
            resolveSourceType,
            resolveReviewerName,
            resolveReviewerUrl,
            resolveAccountUrl,
            resolveIdentityContext
        )
    )
}

export const buildFusionReportStats = (
    serviceRegistry: ServiceRegistry,
    aggregationStats: AggregationStats
): FusionReportStats => {
    const { fusion, forms, log } = serviceRegistry
    const finishedDecisions = forms.finishedFusionDecisions ?? []
    const issueSummary = log.getAggregationIssueSummary()
    const decisionSourceType = (d: { sourceType?: SourceType }): SourceType => d.sourceType ?? SourceType.Authoritative
    // Single pass over finishedDecisions to compute all five counters at once.
    const decisionCountByType = { authoritative: 0, record: 0, orphan: 0 }
    let authoritativeNewIdentities = 0
    let recordNoMatches = 0
    let orphanNoMatches = 0
    let automaticMatches = 0
    for (const d of finishedDecisions) {
        const sourceType = decisionSourceType(d)
        if (sourceType === SourceType.Record) {
            decisionCountByType.record += 1
            if (d.newIdentity) recordNoMatches += 1
        } else if (sourceType === SourceType.Orphan) {
            decisionCountByType.orphan += 1
            if (d.newIdentity) orphanNoMatches += 1
        } else {
            decisionCountByType.authoritative += 1
            if (d.newIdentity) authoritativeNewIdentities += 1
        }
        if (d.automaticAssignment === true) automaticMatches += 1
    }
    const memoryUsage = process.memoryUsage()
    return {
        totalFusionAccounts: fusion.totalFusionAccountCount,
        fusionAccountsFound: serviceRegistry.sources.fusionAccountCount,
        fusionReviewsCreated: forms.formsCreated,
        fusionReviewAssignments: forms.formInstancesCreated,
        fusionReviewsFound: forms.formsFound,
        fusionReviewInstancesFound: forms.formInstancesFound,
        fusionAutomaticMatches: automaticMatches,
        fusionReviewsProcessed: forms.answeredFormInstancesProcessed,
        fusionReviewNewIdentities: authoritativeNewIdentities,
        fusionReviewNonMatches: recordNoMatches + orphanNoMatches,
        fusionReviewDecisionsAuthoritative: decisionCountByType.authoritative,
        fusionReviewDecisionsRecord: decisionCountByType.record,
        fusionReviewDecisionsOrphan: decisionCountByType.orphan,
        fusionReviewNewIdentitiesAuthoritative: authoritativeNewIdentities,
        fusionReviewNoMatchesRecord: recordNoMatches,
        fusionReviewNoMatchesOrphan: orphanNoMatches,
        managedAccountsProcessed: fusion.newManagedAccountsCount,
        identitiesProcessed: fusion.identitiesProcessedCount,
        aggregationWarnings: issueSummary.warningCount,
        aggregationErrors: issueSummary.errorCount,
        warningSamples: issueSummary.warningSamples,
        errorSamples: issueSummary.errorSamples,
        usedMemory: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        ...aggregationStats,
    }
}

export const buildEmailReportFromFusionReport = (
    serviceRegistry: ServiceRegistry,
    baseReport: FusionReport,
    aggregationStats: AggregationStats
): FusionReport => {
    const reportDecisions = buildFusionReviewDecisions(serviceRegistry)
    const stats = buildFusionReportStats(serviceRegistry, aggregationStats)
    const accounts = (baseReport.accounts ?? []).filter((account) => {
        const hasMatches = Array.isArray(account.matches) && account.matches.length > 0
        return hasMatches || account.deferred === true || typeof account.error === 'string'
    })
    const matchAccountCount = accounts.filter(
        (account) => Array.isArray(account.matches) && account.matches.length > 0
    ).length
    return {
        ...baseReport,
        accounts,
        totalAccounts: baseReport.totalAccounts ?? accounts.length,
        matches: baseReport.matches ?? matchAccountCount,
        stats,
        fusionReviewDecisions: reportDecisions,
    }
}

/**
 * Builds and sends a fusion report email for the given fusion account.
 *
 * Data (fusion accounts, identities, managed accounts) must already be in memory.
 * Callers that need to self-fetch should call {@link fetchAndProcessForReport} first
 * and pass the returned stats as `aggregationStats`.
 *
 * Aggregation and account-action reports use `includeNonMatches: false` so unmatched managed
 * accounts are not listed per row; {@link FusionReportStats} still carries consolidated counters.
 */
export const generateReport = async (
    fusionAccount: FusionAccount,
    includeNonMatches: boolean = false,
    serviceRegistry?: ServiceRegistry,
    aggregationStats?: AggregationStats
) => {
    if (!serviceRegistry) {
        serviceRegistry = ServiceRegistry.getCurrent()
    }
    const { fusion, identities, messaging, log } = serviceRegistry
    await hydrateIdentitiesForReportDecisions(serviceRegistry)
    if (aggregationStats) {
        const reportPhaseTimer = log.timer()
        const stats = buildFusionReportStats(serviceRegistry, aggregationStats)
        const report = fusion.generateReport(includeNonMatches, stats)
        report.fusionReviewDecisions = buildFusionReviewDecisions(serviceRegistry)
        reportPhaseTimer.phase('PHASE 7: Report (fusion report)', 'info', 'Report')
        const priorPhases = aggregationStats.phaseTiming ?? []
        stats.phaseTiming = [...priorPhases, ...reportPhaseTimer.getPhaseBreakdown()]
        report.stats = stats
        // aggregationStats is present for both the aggregation report path and reportAction path.
        // Use 'aggregation' label when it came from the real accountList pipeline; 'fusion' for standalone.
        await messaging.sendReport(report, fusionAccount, 'aggregation')
    } else {
        // No aggregation stats — send report without processing statistics.
        // (Legacy call path; callers should prefer passing stats via fetchAndProcessForReport.)
        const report = fusion.generateReport(includeNonMatches, undefined)
        report.fusionReviewDecisions = buildFusionReviewDecisions(serviceRegistry)
        await messaging.sendReport(report, fusionAccount, 'fusion')
        // Clear identity cache since this is a standalone call (no caller owns identity lifecycle)
        identities.clear()
    }
}
