import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import {
    buildCustomReportSummary,
    buildReportAccountIndex,
    createCustomReportRowCounter,
} from './helpers/buildCustomReportPayload'
import {
    buildStatsForCustomReport,
    createSafeSender,
    fetchPhase,
    refreshUniqueAttributesForCustomReport,
    streamEnrichedOutputRows,
    streamFallbackAnalyzedRows,
} from './helpers/customReportHelpers'

/**
 * custom:report command - non-persistent aggregation analysis output.
 *
 * This command analyzes managed accounts against fusion identities and streams
 * final ISC account rows with a `matching` payload in attributes. It does not
 * execute persistence/writeback phases used by std:account:list.
 */
export const customReport = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, sources, identities, fusion } = serviceRegistry

    try {
        const timer = log.timer()
        log.info('Starting custom:report')
        const sender = createSafeSender(serviceRegistry)

        const fetchResult = await fetchPhase(serviceRegistry, input.schema)
        timer.phase('PHASE 1: Fetching data')

        await fusion.processFusionAccounts()
        await fusion.processIdentities()
        identities.clear()
        const analyzedManagedAccounts = await fusion.analyzeManagedAccounts()
        await refreshUniqueAttributesForCustomReport(serviceRegistry, analyzedManagedAccounts)
        timer.phase('PHASE 2: Analyzing managed accounts and refreshing unique attributes')

        const issueSummary = log.getAggregationIssueSummary()
        const report = fusion.generateReport(
            true,
            buildStatsForCustomReport(fetchResult, issueSummary, timer.totalElapsed())
        )
        const reportIndex = buildReportAccountIndex(report.accounts)
        const rowCounter = createCustomReportRowCounter()

        let sentRows = await streamEnrichedOutputRows(serviceRegistry, reportIndex, rowCounter, sender)

        if (sentRows === 0 && analyzedManagedAccounts.length > 0) {
            sentRows = await streamFallbackAnalyzedRows(
                serviceRegistry,
                analyzedManagedAccounts,
                reportIndex,
                rowCounter,
                sender,
                sentRows
            )
        }
        timer.phase('PHASE 3: Streaming enriched ISC account rows')

        const summary = buildCustomReportSummary({
            sentRows,
            rowCounter,
            reportAccounts: report.accounts,
            issueSummary,
            totalProcessingTime: timer.totalElapsed(),
            stats: report.stats,
        })
        sender.send(summary)
        await sender.drain()
        timer.phase('PHASE 4: Building and sending summary')

        fusion.clearAnalyzedAccounts()
        sources.clearManagedAccounts()
        sources.clearFusionAccounts()

        timer.end(`✓ custom:report completed successfully - ${sentRows} account row(s) sent`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash('Failed to run custom:report', error)
    }
}
