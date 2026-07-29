import { ServiceRegistry } from '../../services/serviceRegistry'
import { AggregationStats } from '../../services/fusionService/types'

/**
 * Builds and sends a fusion report email.
 *
 * Callers that need to self-fetch should call {@link buildReportContext} from
 * `./accountListOrchestration` first and pass the returned stats as `aggregationStats`.
 *
 * Aggregation and account-action reports use `includeNonMatches: false` so non-matched managed
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

