import { ServiceRegistry } from '../serviceRegistry'
import { buildReportAggregationStats, buildReportContext } from '../../operations/helpers/accountListPhases'
import { generateReport } from '../../operations/helpers/generateReport'

/** Full report trigger: assemble context, build stats, deliver. */
export async function runReportPipeline(
    serviceRegistry: ServiceRegistry,
    includeNonMatches = false
): Promise<void> {
    const { fetchResult, timer } = await buildReportContext(serviceRegistry)
    const stats = buildReportAggregationStats(fetchResult, timer, serviceRegistry.identities)
    await generateReport(includeNonMatches, serviceRegistry, stats)
}
