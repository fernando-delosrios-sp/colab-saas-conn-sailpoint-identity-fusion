import { ServiceRegistry } from '../../services/serviceRegistry'
import { AggregationStats } from '../../services/fusionService/types'
import { setupPhase, fetchPhase, refreshPhase, processPhase, uniqueAttributesPhase } from './corePipeline'

/**
 * Self-contained fetch + process for standalone report triggers (e.g. reportAction).
 *
 * Runs the full dry-run pipeline (setup → fetch → process) so that all fusion
 * accounts, identities, and managed accounts are in memory — matching exactly
 * what accountList phases 1–3 do, but without persistence or side-effects.
 *
 * @returns AggregationStats ready to pass to generateReport.
 */
export async function fetchAndProcessForReport(serviceRegistry: ServiceRegistry): Promise<AggregationStats> {
    const { log } = serviceRegistry
    const options = { mode: { kind: 'dry-run' } as const }
    const timer = log.timer()

    const shouldContinue = await setupPhase(serviceRegistry, undefined, options)
    if (!shouldContinue) {
        // Reset flag was set — return empty stats; caller should check or ignore report
        return { identitiesFound: 0, managedAccountsFound: 0, totalProcessingTime: timer.totalElapsed() }
    }
    timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

    const fetchResult = await fetchPhase(serviceRegistry, options)
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

/**
 * Builds and sends a fusion report email.
 *
 * Data (fusion accounts, identities, managed accounts) must already be in memory.
 * Callers that need to self-fetch should call {@link fetchAndProcessForReport} first
 * and pass the returned stats as `aggregationStats`.
 *
 * Aggregation and account-action reports use `includeNonMatches: false` so unmatched managed
 * accounts are not listed per row; {@link FusionReportStats} still carries consolidated counters.
 *
 * Recipients are resolved automatically from global owners (source owner + governance group).
 */
export const generateReport = async (
    includeNonMatches: boolean = false,
    serviceRegistry?: ServiceRegistry,
    aggregationStats?: AggregationStats
) => {
    if (!serviceRegistry) {
        serviceRegistry = ServiceRegistry.getCurrent()
    }
    const { reports } = serviceRegistry
    await reports.generateAndSendFusionReport(includeNonMatches, aggregationStats)
}
