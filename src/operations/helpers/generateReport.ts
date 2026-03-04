import { ServiceRegistry } from '../../services/serviceRegistry'
import { FusionAccount } from '../../model/account'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { AggregationStats, FusionReportStats } from '../../services/fusionService/types'

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
    if (aggregationStats) {
        const issueSummary = serviceRegistry.log.getAggregationIssueSummary()
        const decisions = forms.fusionIdentityDecisions
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
            fusionReviewsCreated: forms.formsCreated,
            fusionReviewAssignments: forms.formInstancesCreated,
            fusionReviewNewIdentities: authoritativeNewIdentities,
            fusionReviewNonMatches: recordNoMatches + orphanNoMatches,
            fusionReviewDecisionsAuthoritative: decisionCountByType.authoritative,
            fusionReviewDecisionsRecord: decisionCountByType.record,
            fusionReviewDecisionsOrphan: decisionCountByType.orphan,
            fusionReviewNewIdentitiesAuthoritative: authoritativeNewIdentities,
            fusionReviewNoMatchesRecord: recordNoMatches,
            fusionReviewNoMatchesOrphan: orphanNoMatches,
            managedAccountsProcessed: fusion.newManagedAccountsCount,
            managedAccountsProcessedAuthoritative: aggregationStats.managedAccountsFoundAuthoritative,
            managedAccountsProcessedRecord: aggregationStats.managedAccountsFoundRecord,
            managedAccountsProcessedOrphan: aggregationStats.managedAccountsFoundOrphan,
            aggregationWarnings: issueSummary.warningCount,
            aggregationErrors: issueSummary.errorCount,
            warningSamples: issueSummary.warningSamples,
            errorSamples: issueSummary.errorSamples,
            usedMemory: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            ...aggregationStats,
        }
    }

    const report = fusion.generateReport(includeNonMatches, stats)
    await messaging.sendReport(report, fusionAccount)
}
