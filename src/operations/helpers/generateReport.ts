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
        const decisions = forms.fusionIdentityDecisions
        const memoryUsage = process.memoryUsage()
        stats = {
            totalFusionAccounts: fusion.totalFusionAccountCount,
            fusionReviewsCreated: forms.formsCreated,
            fusionReviewAssignments: forms.formInstancesCreated,
            fusionReviewNewIdentities: decisions.filter((d) => d.newIdentity).length,
            fusionReviewNonMatches: decisions.filter((d) => !d.newIdentity).length,
            managedAccountsProcessed: fusion.newManagedAccountsCount,
            usedMemory: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            ...aggregationStats,
        }
    }

    const report = fusion.generateReport(includeNonMatches, stats)
    await messaging.sendReport(report, fusionAccount)
}
