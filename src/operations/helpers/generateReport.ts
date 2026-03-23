import { ServiceRegistry } from '../../services/serviceRegistry'
import { FusionAccount } from '../../model/account'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { AggregationStats, FusionReportDecision, FusionReportStats } from '../../services/fusionService/types'
import { FusionDecision } from '../../model/form'
import { createUrlContext } from '../../utils/url'

const toReportDecision = (
    decision: FusionDecision,
    resolveSourceType?: (sourceName?: string) => 'authoritative' | 'record' | 'orphan' | undefined,
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

    return {
        reviewerId: decision.submitter.id,
        reviewerName: decision.submitter.name || decision.submitter.id,
        reviewerEmail: decision.submitter.email || undefined,
        accountId: decision.account.id,
        accountName: decision.account.name || decision.account.id,
        accountSource: decision.account.sourceName || '',
        sourceType,
        decision: decisionType,
        decisionLabel,
        selectedIdentityId: decision.identityId || undefined,
        selectedIdentityName: selectedIdentityContext.selectedIdentityName,
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

    if (fusion.commandType !== StandardCommand.StdAccountList) {
        const fetchPromises = [
            messaging.fetchSender(),
            sources.fetchFusionAccounts(),
            identities.fetchIdentities(),
            sources.fetchManagedAccounts(),
        ]

        await Promise.all(fetchPromises)

        await fusion.processFusionAccounts()
        await fusion.processIdentities()

        identities.clear()

        await fusion.analyzeManagedAccounts()
    }

    let stats: FusionReportStats | undefined
    const finishedDecisions = forms.finishedFusionDecisions
    const urlContext = createUrlContext(serviceRegistry.config.baseurl)
    const resolveSourceType = (sourceName?: string): 'authoritative' | 'record' | 'orphan' | undefined =>
        sourceName ? sources.getSourceByName(sourceName)?.sourceType : undefined
    const resolveIdentityContext = (
        identityId?: string
    ): { selectedIdentityName?: string; selectedIdentityUrl?: string } => {
        if (!identityId) return {}
        const identity = identities.getIdentityById(identityId)
        const selectedIdentityName = identity?.displayName || identity?.name || identityId
        return {
            selectedIdentityName,
            selectedIdentityUrl: urlContext.identity(identityId),
        }
    }
    const reportDecisions = finishedDecisions.map((decision) =>
        toReportDecision(decision, resolveSourceType, resolveIdentityContext)
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
    }

    const report = fusion.generateReport(includeNonMatches, stats)
    report.fusionReviewDecisions = reportDecisions
    await messaging.sendReport(report, fusionAccount)
}
