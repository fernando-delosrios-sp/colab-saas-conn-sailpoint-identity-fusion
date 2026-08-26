import { ServiceRegistry } from '../../services/serviceRegistry'
import { AggregationStats } from '../../services/fusionService/types'
import type { FusionHtmlReportKind } from '../../services/reportService'

/**
 * Builds and sends an aggregation report or Fusion report email.
 *
 * Callers that need to self-fetch should call {@link buildReportContext} from
 * `./accountListOrchestration` first and pass the returned stats as `aggregationStats`.
 *
 * Aggregation report and Fusion report use `includeNonMatches: false` so non-matched managed
 * accounts are not listed per row; {@link FusionReportStats} still carries consolidated counters.
 *
 * Recipients are resolved automatically from global owners (source owner + governance group).
 *
 * @param reportKind - `'aggregation'` for the post-aggregation owner email; `'fusion'` for the `report` action
 */
export const generateReport = async (
    includeNonMatches: boolean = false,
    serviceRegistry?: ServiceRegistry,
    aggregationStats?: AggregationStats,
    reportKind: FusionHtmlReportKind = 'aggregation'
) => {
    if (!serviceRegistry) {
        serviceRegistry = ServiceRegistry.getCurrent()
    }
    const { reports } = serviceRegistry
    await reports.generateAndSendFusionReport(includeNonMatches, aggregationStats, reportKind)
}

