import { ServiceRegistry } from '../../services/serviceRegistry'
import { FusionAccount } from '../../model/account'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { AggregationStats, FusionReportDecision, FusionReportStats } from '../../services/fusionService/types'
import { FusionDecision } from '../../model/form'
import { createUrlContext } from '../../utils/url'

const toReportDecision = (
    decision: FusionDecision,
    resolveSourceType?: (sourceName?: string) => 'authoritative' | 'record' | 'orphan' | undefined,
    resolveReviewerName?: (reviewerId?: string) => string | undefined,
    resolveReviewerUrl?: (reviewerId?: string) => string | undefined,
    resolveAccountUrl?: (accountId?: string) => string | undefined,
    resolveIdentityContext?: (identityId?: string) => { selectedIdentityName?: string; selectedIdentityUrl?: string }
): FusionReportDecision => {
    const sourceType = decision.sourceType ?? resolveSourceType?.(decision.account.sourceName) ?? 'authoritative'
    const isNoMatchSource = sourceType === 'record' || sourceType === 'orphan'
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
    const reviewerName = decision.submitter.name || resolveReviewerName?.(decision.submitter.id) || decision.submitter.id
    const selectedIdentityName = decision.identityName || selectedIdentityContext.selectedIdentityName || decision.identityId
    const correlatedIdentityContext = resolveIdentityContext?.((decision as any).correlatedIdentityId) ?? {}
    const correlatedAccountName = correlatedIdentityContext.selectedIdentityName

    return {
        reviewerId: decision.submitter.id,
        reviewerName,
        reviewerUrl: resolveReviewerUrl?.(decision.submitter.id),
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
    }
}

/**
 * Generates and sends a fusion report for the given account.
 * When called outside of account list, fetches all required data first.
 * When aggregationStats are provided (account list path), builds full report stats
 * from the services plus the externally-known snapshot values.
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
    const { fusion, forms, identities, sources, messaging } = serviceRegistry

    // Used to populate "Processing Statistics" even for on-demand/manual reports.
    // (Aggregation path passes its own AggregationStats + timer.)
    const timer = serviceRegistry.log.timer()
    let autoFetchStats:
        | Pick<
              AggregationStats,
              | 'identitiesFound'
              | 'managedAccountsFound'
              | 'managedAccountsFoundAuthoritative'
              | 'managedAccountsFoundRecord'
              | 'managedAccountsFoundOrphan'
          >
        | undefined

    if (fusion.commandType !== StandardCommand.StdAccountList) {
        const fetchPromises = [
            messaging.fetchSender(),
            sources.fetchFusionAccounts(),
            identities.fetchIdentities(),
            sources.fetchManagedAccounts(),
        ]

        await Promise.all(fetchPromises)

        // Capture "found" snapshot counts before work-queue processing mutates/consumes the maps.
        const identitiesFound = identities.identityCount
        const managedAccountsFound = sources.managedAccountsById.size
        let managedAccountsFoundAuthoritative = 0
        let managedAccountsFoundRecord = 0
        let managedAccountsFoundOrphan = 0
        for (const account of sources.managedAccountsById.values()) {
            const sourceType = sources.getSourceByName(account.sourceName ?? '')?.sourceType ?? 'authoritative'
            if (sourceType === 'record') managedAccountsFoundRecord++
            else if (sourceType === 'orphan') managedAccountsFoundOrphan++
            else managedAccountsFoundAuthoritative++
        }
        autoFetchStats = {
            identitiesFound,
            managedAccountsFound,
            managedAccountsFoundAuthoritative,
            managedAccountsFoundRecord,
            managedAccountsFoundOrphan,
        }

        await fusion.processFusionAccounts()
        await fusion.processIdentities()

        await fusion.analyzeManagedAccounts()
    }

    let stats: FusionReportStats | undefined
    const finishedDecisions = forms.finishedFusionDecisions
    // Ensure we can render reviewer/selected identity display names even if the identity cache was cleared earlier
    // (e.g. std:account:list clears identities for memory before report phase).
    const idsToHydrate = new Set<string>()
    for (const d of finishedDecisions) {
        if (d?.submitter?.id) idsToHydrate.add(d.submitter.id)
        if (d?.identityId) idsToHydrate.add(d.identityId)
    }
    for (const id of idsToHydrate) {
        if (!identities.getIdentityById(id)) {
            try {
                // Best-effort: hydrate display names for reporting
                await identities.fetchIdentityById(id)
            } catch {
                // ignore
            }
        }
    }

    const urlContext = createUrlContext(serviceRegistry.config.baseurl)
    const resolveSourceType = (sourceName?: string): 'authoritative' | 'record' | 'orphan' | undefined =>
        sourceName ? sources.getSourceByName(sourceName)?.sourceType : undefined
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
            (identity as any)?.displayName || (identity as any)?.attributes?.displayName || (identity as any)?.name || identityId
        return {
            selectedIdentityName,
            selectedIdentityUrl: urlContext.identity(identityId),
        }
    }
    const reportDecisions = finishedDecisions.map((decision) =>
        toReportDecision(
            decision,
            resolveSourceType,
            resolveReviewerName,
            resolveReviewerUrl,
            resolveAccountUrl,
            resolveIdentityContext
        )
    )
    if (aggregationStats) {
        const issueSummary = serviceRegistry.log.getAggregationIssueSummary()
        const decisions = finishedDecisions
        const decisionSourceType = (d: {
            sourceType?: 'authoritative' | 'record' | 'orphan'
        }): 'authoritative' | 'record' | 'orphan' => d.sourceType ?? 'authoritative'
        const decisionCountByType = decisions.reduce(
            (acc, d) => {
                const sourceType = decisionSourceType(d)
                if (sourceType === 'record') acc.record += 1
                else if (sourceType === 'orphan') acc.orphan += 1
                else acc.authoritative += 1
                return acc
            },
            { authoritative: 0, record: 0, orphan: 0 }
        )
        const authoritativeNewIdentities = decisions.filter(
            (d) => decisionSourceType(d) === 'authoritative' && d.newIdentity
        ).length
        const recordNoMatches = decisions.filter((d) => decisionSourceType(d) === 'record' && d.newIdentity).length
        const orphanNoMatches = decisions.filter((d) => decisionSourceType(d) === 'orphan' && d.newIdentity).length
        const memoryUsage = process.memoryUsage()
        stats = {
            totalFusionAccounts: fusion.totalFusionAccountCount,
            fusionAccountsFound: sources.fusionAccountCount,
            fusionReviewsCreated: forms.formsCreated,
            fusionReviewAssignments: forms.formInstancesCreated,
            fusionReviewsFound: forms.formsFound,
            fusionReviewInstancesFound: forms.formInstancesFound,
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
    } else if (autoFetchStats) {
        // Manual/on-demand report path: build stats from locally available snapshot values.
        const issueSummary = serviceRegistry.log.getAggregationIssueSummary()
        const memoryUsage = process.memoryUsage()
        stats = {
            totalFusionAccounts: fusion.totalFusionAccountCount,
            fusionAccountsFound: sources.fusionAccountCount,
            fusionReviewsCreated: forms.formsCreated,
            fusionReviewAssignments: forms.formInstancesCreated,
            fusionReviewsFound: forms.formsFound,
            fusionReviewInstancesFound: forms.formInstancesFound,
            fusionReviewsProcessed: forms.answeredFormInstancesProcessed,
            managedAccountsProcessed: fusion.newManagedAccountsCount,
            identitiesProcessed: fusion.identitiesProcessedCount,
            aggregationWarnings: issueSummary.warningCount,
            aggregationErrors: issueSummary.errorCount,
            warningSamples: issueSummary.warningSamples,
            errorSamples: issueSummary.errorSamples,
            usedMemory: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            totalProcessingTime: timer.totalElapsed(),
            ...autoFetchStats,
        }
    }

    const report = fusion.generateReport(includeNonMatches, stats)
    report.fusionReviewDecisions = reportDecisions
    await messaging.sendReport(report, fusionAccount, aggregationStats ? 'aggregation' : 'fusion')

    // Keep memory behavior: on-demand/manual report path can clear identity cache after email formatting.
    if (fusion.commandType !== StandardCommand.StdAccountList) {
        identities.clear()
    }
}
