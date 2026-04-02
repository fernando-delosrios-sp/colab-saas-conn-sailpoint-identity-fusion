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
 * execute persistence/writeback phases used by std:account:list, and it does not
 * perform aggregation side effects (Match review forms, managed-account disables,
 * or per-source correlation API calls) — those run only when `commandType` is
 * `std:account:list`. In-memory unique-value tracking for the run behaves like
 * aggregation; it is not persisted unless `std:account:list` saves connector state.
 */
export const customReport = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, sources, identities, fusion, forms } = serviceRegistry

    try {
        const timer = log.timer()
        log.info('Starting custom:report')
        const sender = createSafeSender(serviceRegistry)
        const runtimeOptions: CustomReportRuntimeOptions = {
            includeExisting:
                typeof (input as any).includeExisting === 'boolean'
                    ? (input as any).includeExisting
                    : typeof (input as any).includeBaseline === 'boolean'
                      ? (input as any).includeBaseline
                      : false,
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

        // Match std:account:list work-queue depletion behavior so unique attributes
        // (including incremental counters) are applied to the same set of registered
        // fusion accounts that will be eligible for output.
        if (typeof (fusion as any).processFusionIdentityDecisions === 'function') {
            await (fusion as any).processFusionIdentityDecisions()
        }
        await fusion.processManagedAccounts()
        if (typeof (fusion as any).reconcilePendingFormState === 'function') {
            ;(fusion as any).reconcilePendingFormState()
        }

        const analyzedManagedAccounts: any[] = []
        await refreshUniqueAttributesForCustomReport(serviceRegistry, analyzedManagedAccounts as any, runtimeOptions)
        timer.phase('PHASE 2: Processing managed accounts and refreshing unique attributes')

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

        // Safety net: if no registered accounts were emitted (e.g. highly filtered run),
        // analyze remaining managed accounts and stream them as fallback.
        const fallbackAnalyzedManagedAccounts =
            sentRows === 0 && typeof fusion.analyzeManagedAccounts === 'function' ? await fusion.analyzeManagedAccounts() : []
        if (fallbackAnalyzedManagedAccounts.length > 0) {
            await refreshUniqueAttributesForCustomReport(serviceRegistry, fallbackAnalyzedManagedAccounts, runtimeOptions)
            sentRows = await streamFallbackAnalyzedRows(
                serviceRegistry,
                fallbackAnalyzedManagedAccounts,
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
