import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { readArray, readBoolean, readNumber } from '../utils/safeRead'
import { ServiceRegistry } from '../services/serviceRegistry'
import { sanitizeRecipients } from '../services/messagingService/email'
import {
    DryRunRuntimeOptions,
    buildStatsForDryRun,
    createDryRunRowEmitter,
    finalizeDryRun,
    streamDryRunRows,
    writeAndSendDryRunReport,
} from './helpers/dryRunHelpers'
import {
    CorePipelineOptions,
    setupPhase,
    fetchPhase,
    processPhase,
} from './helpers/corePipeline'

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
        timer.phase('PHASE 1: Setup and initialization')

        const fetchResult = await fetchPhase(serviceRegistry, options)
        timer.phase('PHASE 2: Fetching data in parallel')

        await processPhase(serviceRegistry, options)
        timer.phase('PHASE 3: Work queue depletion and form reconciliation')

        const issueSummary = log.getAggregationIssueSummary()
        const fusionCounts = {
            fusionAccountsFound: sources.fusionAccountCount,
            totalFusionAccounts: readNumber(fusion, 'totalFusionAccountCount', sources.fusionAccountCount),
        }
        const preStreamingStats = buildStatsForDryRun(fetchResult, issueSummary, timer.totalElapsed(), fusionCounts)
        const report = fusion.generateReport(true, preStreamingStats)
        const { sentRows, optionEmitCounter } = await streamDryRunRows(serviceRegistry, report, runtimeOptions, rowEmitter)

        timer.phase('PHASE 4: Streaming enriched ISC account rows')
        const canonicalTotalProcessingTime = timer.totalElapsed()
        const finalDryRunStats = buildStatsForDryRun(
            fetchResult,
            issueSummary,
            canonicalTotalProcessingTime,
            fusionCounts
        )
        const reportHtmlOutputPath = await writeAndSendDryRunReport(serviceRegistry, report, finalDryRunStats, runtimeOptions)

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
        timer.phase('PHASE 5: Building and sending summary')

        const doneMsg = runtimeOptions.writeToDisk
            ? `✓ custom:dryrun completed successfully - ${completedRows} account row(s) written to disk; summary sent (${rowEmitter.diskOutputPath ?? 'n/a'})`
            : `✓ custom:dryrun completed successfully - ${completedRows} account row(s) sent`
        timer.end(doneMsg)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        console.error(error); log.crash('Failed to run custom:dryrun', error)
    }
}
