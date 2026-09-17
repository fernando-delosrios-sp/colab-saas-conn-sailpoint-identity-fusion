import { ServiceRegistry } from '../../services/serviceRegistry'
import { buildReportAggregationStats } from './accountListHelpers'
import { buildReportContext } from './accountListOrchestration'
import { generateReport } from './generateReport'

/**
 * Fusion report trigger from the `report` action: dry-run Match preview (writes inhibited),
 * Process only (no Output stream), then email the Fusion report to global owners.
 */
export async function runReportPipeline(
    serviceRegistry: ServiceRegistry,
    includeNonMatches = false
): Promise<void> {
    serviceRegistry.activateDryRunMode()
    const { fetchResult, timer } = await buildReportContext(serviceRegistry)
    const stats = buildReportAggregationStats(fetchResult, timer, serviceRegistry.identities)
    await generateReport(includeNonMatches, serviceRegistry, stats, 'fusion')
}
