import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { readArray, readBoolean, readNumber } from '../utils/safeRead'
import { ServiceRegistry } from '../services/serviceRegistry'
import { sanitizeRecipients } from '../services/messagingService/email'
import {
    DryRunRuntimeOptions,
    buildStatsForDryRun,
    createDryRunRowEmitter,
    finalizeDryRun,
    prepareDryRunOutputData,
    streamDryRunRows,
    writeAndSendDryRunReport,
} from './helpers/dryRunHelpers'
import {
    CorePipelineOptions,
    setupPhase,
    fetchPhase,
    refreshPhase,
    processPhase,
    uniqueAttributesPhase,
} from './helpers/corePipeline'
import { PhaseTimer } from '../services/logService'

const buildDryRunRuntimeOptions = (input: StdAccountListInput): DryRunRuntimeOptions => {
    return {
        includeExisting: readBoolean(input, 'includeExisting', false),
        includeNonMatched: readBoolean(input, 'includeNonMatched', false),
        includeMatched: readBoolean(input, 'includeMatched', false),
        includeExact: readBoolean(input, 'includeExact', false),
        includeDeferred: readBoolean(input, 'includeDeferred', false),
        includeReview: readBoolean(input, 'includeReview', false),
        includeDecisions: readBoolean(input, 'includeDecisions', false),
        writeToDisk: readBoolean(input, 'writeToDisk', false),
        sendReportTo: sanitizeRecipients(readArray(input, 'sendReportTo', [])),
    }
}

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
    const { log, sources, fusion } = serviceRegistry
    const options: CorePipelineOptions = { mode: { kind: 'dry-run' } }

    try {
        const timer = log.timer()
        log.info('Starting custom:dryrun')
        const { res } = serviceRegistry
        if (typeof res.keepAlive === 'function') {
            res.keepAlive()
        }
        const runtimeOptions = buildDryRunRuntimeOptions(input)

        const rowEmitter = await createDryRunRowEmitter(serviceRegistry, runtimeOptions)

        const shouldContinue = await setupPhase(serviceRegistry, input.schema, options)
        if (!shouldContinue) return
        timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

        const fetchResult = await fetchPhase(serviceRegistry, options)
        timer.phase('PHASE 2: Fetching data in parallel', 'info', 'Fetch')

        await refreshPhase(serviceRegistry, options)
        timer.phase('PHASE 3: Refresh (fusion accounts)', 'info', 'Refresh')

        await processPhase(serviceRegistry, options)
        timer.phase('PHASE 4: Process (identities, managed accounts, form reconciliation)', 'info', 'Process')

        await uniqueAttributesPhase(serviceRegistry, options)
        timer.phase('PHASE 5: Unique attributes', 'info', 'Unique attributes')

        const issueSummary = log.getAggregationIssueSummary()
        const fusionCounts = {
            fusionAccountsFound: sources.fusionAccountCount,
            totalFusionAccounts: readNumber(fusion, 'totalFusionAccountCount', sources.fusionAccountCount),
        }
        const prePipelinePhaseBreakdown = timer.getPhaseBreakdown()
        const preStreamingStats = buildStatsForDryRun(
            fetchResult,
            issueSummary,
            timer.totalElapsed(),
            fusionCounts,
            prePipelinePhaseBreakdown
        )
        const report = fusion.generateReport(true, preStreamingStats)
        const outputPreparationStartedAt = Date.now()
        const preparedOutputData = await prepareDryRunOutputData(serviceRegistry, runtimeOptions)
        log.info(
            `PHASE 6: Output preparation — finalize dry-run analysis (${PhaseTimer.formatElapsed(
                Date.now() - outputPreparationStartedAt
            )})`
        )
        const streamStartedAt = Date.now()
        const { sentRows, optionEmitCounter } = await streamDryRunRows(
            serviceRegistry,
            report,
            preparedOutputData,
            runtimeOptions,
            rowEmitter
        )
        const streamElapsedMs = Date.now() - streamStartedAt
        log.info(
            `PHASE 6: Output — streaming enriched ISC account rows (${PhaseTimer.formatElapsed(
                streamElapsedMs
            )})`
        )
        timer.recordElapsed('Output', Date.now() - outputPreparationStartedAt)

        const canonicalTotalProcessingTime = timer.totalElapsed()
        const phaseBreakdownThroughOutput = timer.getPhaseBreakdown()
        const finalDryRunStats = buildStatsForDryRun(
            fetchResult,
            issueSummary,
            canonicalTotalProcessingTime,
            fusionCounts,
            phaseBreakdownThroughOutput
        )
        const reportPhaseStartedAt = Date.now()
        const writeResult = await writeAndSendDryRunReport(
            serviceRegistry,
            report,
            finalDryRunStats,
            runtimeOptions,
            reportPhaseStartedAt
        )
        let reportHtmlOutputPath: string | undefined
        if (writeResult) {
            reportHtmlOutputPath = writeResult.reportHtmlOutputPath
            Object.assign(finalDryRunStats, { phaseTiming: writeResult.statsWithPhaseTiming.phaseTiming })
            report.stats = { ...report.stats, ...writeResult.statsWithPhaseTiming }
        } else {
            const reportOnlyElapsedMs = Date.now() - reportPhaseStartedAt
            const fullBreakdown = [
                ...phaseBreakdownThroughOutput,
                { phase: 'Report', elapsed: PhaseTimer.formatElapsed(reportOnlyElapsedMs) },
            ]
            Object.assign(finalDryRunStats, { phaseTiming: fullBreakdown })
            report.stats = { ...report.stats, phaseTiming: fullBreakdown }
        }

        const { sentRows: completedRows } = await finalizeDryRun(serviceRegistry, {
            sentRows,
            optionEmitCounter,
            runtimeOptions,
            rowEmitter,
            report,
            issueSummary,
            canonicalTotalProcessingTime,
            reportHtmlOutputPath,
        })

        const doneMsg = runtimeOptions.writeToDisk
            ? `✓ custom:dryrun completed successfully - ${completedRows} account row(s) written to disk; summary sent (${rowEmitter.diskOutputPath ?? 'n/a'})`
            : `✓ custom:dryrun completed successfully - ${completedRows} account row(s) sent`
        timer.end(doneMsg)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        console.error(error); log.crash('Failed to run custom:dryrun', error)
    }
}
