import { ServiceRegistry } from '../../services/serviceRegistry'
import { AggregationStats } from '../../services/fusionService/types'
import { PipelineRunner } from './corePipeline'

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
    const result = await PipelineRunner.run(serviceRegistry, {
        mode: { kind: 'dry-run' },
        targetPhase: 'uniqueAttributes',
    })

    if (!result.shouldContinue || !result.fetchResult) {
        // Reset flag was set — return empty stats; caller should check or ignore report
        return { identitiesFound: 0, managedAccountsFound: 0, totalProcessingTime: result.timer.totalElapsed() }
    }

    const { fetchResult, timer } = result
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
