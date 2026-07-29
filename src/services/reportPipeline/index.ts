import { ServiceRegistry } from '../serviceRegistry'
import { AggregationStats } from '../fusionService/types'
import {
    buildReportAggregationStats,
    buildReportContext,
    type FetchResult,
} from '../../operations/helpers/accountListPhases'
import { generateReport } from '../../operations/helpers/generateReport'

export type { FetchResult }

/** Run setup → fetch → refresh → process to populate in-memory state for reporting. */
export const assembleReportContext = buildReportContext

/** Map fetch counters and phase timing into report aggregation stats. */
export function buildReportStats(
    fetchResult: FetchResult,
    timer: ReturnType<ServiceRegistry['log']['timer']>,
    identities: ServiceRegistry['identities'],
    outputCount?: number
): AggregationStats {
    return buildReportAggregationStats(fetchResult, timer, identities, outputCount)
}

/** Render and deliver the fusion report email. */
export const deliverReport = generateReport

/** Full report trigger: assemble context, build stats, deliver. */
export async function runReportPipeline(
    serviceRegistry: ServiceRegistry,
    includeNonMatches = false
): Promise<void> {
    const { fetchResult, timer } = await assembleReportContext(serviceRegistry)
    const stats = buildReportStats(fetchResult, timer, serviceRegistry.identities)
    await deliverReport(includeNonMatches, serviceRegistry, stats)
}
