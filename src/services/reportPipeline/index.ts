import { ServiceRegistry } from '../serviceRegistry'
import { buildReportAggregationStats } from '../../operations/helpers/accountListHelpers'
import { buildReportContext } from '../../operations/helpers/accountListOrchestration'
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

