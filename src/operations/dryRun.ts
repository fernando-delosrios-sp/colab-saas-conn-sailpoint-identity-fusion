import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import {
    initializeDryRunExecution,
    prepareDryRunOutputData,
    streamDryRunRows,
} from './helpers/dryRunHelpers'
import { buildDryRunSummary } from './helpers/buildDryRunPayload'
import {
    CorePipelineOptions,
    setupPhase,
    fetchPhase,
    refreshPhase,
    processPhase,
} from './helpers/corePipeline'
import { PhaseTimer } from '../services/logService'

/**
 * custom:dryrun command - non-persistent aggregation analysis output.
 *
 * This command analyzes managed accounts against fusion identities and streams
 * final ISC account rows with a `matching` payload in attributes (unless
 * `writeToDisk` is true, in which case rows plus the same summary object are written as
 * pretty-printed JSON (`{ "summary": {...}, "rows": [...] }`) under `./reports` and
 * only the summary is returned). It shares the same setup and process phases as
 * std:account:list to ensure perfect consistency, but uses isPersistent=false to inhibit
 * persistence and external API side-effects.
 */
export const dryRun = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, reports } = serviceRegistry
    const options: CorePipelineOptions = { mode: { kind: 'dry-run' } }

    try {
        const timer = log.timer()
        log.info('Starting custom:dryrun')
        const execution = await initializeDryRunExecution(serviceRegistry, input, reports)
        if (!execution) return
        const { runtimeOptions, rowEmitter } = execution

        // PHASES 1-4: Shared core pipeline
        const shouldContinue = await setupPhase(serviceRegistry, input.schema, options)
        if (!shouldContinue) return
        timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

        const fetchResult = await fetchPhase(serviceRegistry, options)
        timer.phase('PHASE 2: Fetching data in parallel', 'info', 'Fetch')

        await refreshPhase(serviceRegistry, options)
        timer.phase('PHASE 3: Refresh (fusion accounts)', 'info', 'Refresh')

        await processPhase(serviceRegistry, options)
        timer.phase('PHASE 4: Process (identities, managed accounts, form reconciliation)', 'info', 'Process')

        const issueSummary = log.getAggregationIssueSummary()
        const { report } = reports.initializeDryRunReport({
            fetchResult,
            totalProcessingTime: timer.totalElapsed(),
            phaseTiming: timer.getPhaseBreakdown(),
            includeNonMatches: true,
        })

        // PHASE 5: Prepare output data and metadata
        const outputPreparationStartedAt = Date.now()
        const preparedOutputData = await prepareDryRunOutputData(serviceRegistry, runtimeOptions)
        timer.recordElapsed('Unique attributes', preparedOutputData.uniqueAttributesElapsedMs)
        log.info(
            `PHASE 5: Output preparation — finalize dry-run analysis (${PhaseTimer.formatElapsed(
                Date.now() - outputPreparationStartedAt
            )})`
        )

        // PHASE 6: Stream rows
        const streamStartedAt = Date.now()
        const { sentRows, optionEmitCounter } = await streamDryRunRows(
            serviceRegistry,
            report,
            preparedOutputData,
            runtimeOptions,
            rowEmitter
        )
        const streamElapsedMs = Date.now() - streamStartedAt
        log.info(`PHASE 6: Output — streaming enriched ISC account rows (${PhaseTimer.formatElapsed(streamElapsedMs)})`)
        timer.recordElapsed('Output', streamElapsedMs)

        // Final stats and report write/send
        const totalProcessingTime = timer.totalElapsed()
        const { reportHtmlOutputPath } = await reports.finalizeDryRunReport({
            report,
            fetchResult,
            totalProcessingTime,
            phaseBreakdownThroughOutput: timer.getPhaseBreakdown(),
        })

        const summary = buildDryRunSummary({
            sentRows,
            optionEmitCounter,
            reportOptions: runtimeOptions,
            reportAccounts: report.accounts,
            issueSummary,
            totalProcessingTime,
            stats: report.stats,
            fusionReviewDecisionsCount: (report.fusionReviewDecisions ?? []).length,
            writeToDisk: runtimeOptions.writeToDisk,
            reportOutputPath: rowEmitter.diskOutputPath,
            reportHtmlOutputPath,
        })

        if (runtimeOptions.writeToDisk) {
            try {
                await rowEmitter.close(summary)
            } catch {
                /* ignore close errors after a failed run */
            }
        }

        serviceRegistry.res.send(summary)
        serviceRegistry.fusion.clearAnalyzedAccounts()
        serviceRegistry.sources.clearManagedAccounts()
        serviceRegistry.sources.clearFusionAccounts()

        const completedRows = sentRows
        const doneMsg = execution.runtimeOptions.writeToDisk
            ? `✓ custom:dryrun completed successfully - ${completedRows} account row(s) written to disk; summary sent (${execution.rowEmitter.diskOutputPath ?? 'n/a'})`
            : `✓ custom:dryrun completed successfully - ${completedRows} account row(s) sent`
        timer.end(doneMsg)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash('Failed to run custom:dryrun', error)
    }
}
