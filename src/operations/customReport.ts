import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import {
    buildCustomReportSummary,
    buildReportAccountIndex,
    createCustomReportRowCounter,
} from './helpers/buildCustomReportPayload'
import {
    buildStatsForCustomReport,
    CustomReportRuntimeOptions,
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
    const { log, sources, identities, fusion, forms } = serviceRegistry

    try {
        const timer = log.timer()
        log.info('Starting custom:report')
        const sender = createSafeSender(serviceRegistry)
        const runtimeOptions: CustomReportRuntimeOptions = {
            includeBaseline: typeof (input as any).includeBaseline === 'boolean' ? (input as any).includeBaseline : false,
            includeUnmatched:
                typeof (input as any).includeUnmatched === 'boolean' ? (input as any).includeUnmatched : false,
            includeMatched: typeof (input as any).includeMatched === 'boolean' ? (input as any).includeMatched : false,
            includeDeferred: typeof (input as any).includeDeferred === 'boolean' ? (input as any).includeDeferred : false,
            includeReview: typeof (input as any).includeReview === 'boolean' ? (input as any).includeReview : false,
            includeDecisions:
                typeof (input as any).includeDecisions === 'boolean' ? (input as any).includeDecisions : false,
        }

        const fetchResult = await fetchPhase(serviceRegistry, input.schema)
        await forms.fetchFormData()
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
        const pendingReviewByAccountId = forms.pendingReviewContextByAccountId
        const decisionAccountIds = new Set((report.fusionReviewDecisions ?? []).map((decision) => decision.accountId))
        const emittedRowKeys = new Set<string>()
        const rowCounter = createCustomReportRowCounter()

        let sentRows = await streamEnrichedOutputRows(
            serviceRegistry,
            reportIndex,
            pendingReviewByAccountId,
            decisionAccountIds,
            emittedRowKeys,
            rowCounter,
            sender,
            runtimeOptions
        )

        if (analyzedManagedAccounts.length > 0) {
            sentRows = await streamFallbackAnalyzedRows(
                serviceRegistry,
                analyzedManagedAccounts,
                reportIndex,
                pendingReviewByAccountId,
                decisionAccountIds,
                emittedRowKeys,
                rowCounter,
                sender,
                sentRows,
                runtimeOptions
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
