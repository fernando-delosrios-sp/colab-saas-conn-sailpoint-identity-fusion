import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { AggregationTracker } from '../services/fusionService'
import { generateReport } from './helpers/generateReport'
import { parseDryRunInput, buildTerminalSummary } from './helpers/accountListHelpers'
import {
    PhaseOptions,
    setupPhase,
    fetchPhase,
    refreshPhase,
    processPhase,
    outputPhase,
    fetchResultToAggregationStats,
} from './helpers/accountListPhases'

export { hydrateCorrelatedManagedAccountIdentities } from './helpers/accountListPhases'

/**
 * Account list operation — main entry point for identity fusion processing.
 *
 * Supports an optional dry-run mode via the dryRun input parameter:
 *   { dryRun: { enabled: true, saveFile?: boolean, sendEmail?: string | string[] } }
 *
 * When dry-run mode is active, the operation runs non-persistently, streams
 * 1-to-1 StdAccountListOutput rows, and sends a terminal summary object.
 */
export const accountList = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    const { log, reports, res, sources } = serviceRegistry
    const tracker = new AggregationTracker()
    const dryRun = parseDryRunInput(input)
    const isPersistent = !dryRun
    const timer = log.timer()

    try {
        log.info(dryRun ? 'Starting dry-run analysis' : 'Starting aggregation')

        const options: PhaseOptions = { isPersistent, tracker }

        if (!(await setupPhase(serviceRegistry, input.schema, options))) return
        timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

        const fetchResult = await fetchPhase(serviceRegistry, options)
        timer.phase('PHASE 2: Fetching data in parallel', 'info', 'Fetch')

        await refreshPhase(serviceRegistry)
        timer.phase('PHASE 3: Refresh (fusion accounts)', 'info', 'Refresh')

        await processPhase(serviceRegistry, options)
        timer.phase('PHASE 4: Process (identities, managed accounts, form reconciliation)', 'info', 'Process')

        const outputCount = await outputPhase(serviceRegistry, options)
        timer.phase('PHASE 5: Output (JIT attributes, serialize & clean up memory)', 'info', 'Output')

        if (isPersistent && fetchResult && serviceRegistry.fusion.fusionReportOnAggregation) {
            log.info('Generating aggregation report')
            const reportOp = log.track('reportPhase.generateReport')
            await generateReport(false, serviceRegistry, fetchResultToAggregationStats(fetchResult, timer))
            reportOp.done()
        }
        timer.phase('PHASE 6: Report generation', 'info', 'Report')

        if (!sources.run.isRecordMode) {
            sources.clearFusionAccounts()
        } else {
            log.info('Fusion accounts cache retained for recording')
        }
        log.info('Account caches cleared from memory')

        if (dryRun && fetchResult) {
            const summary = buildTerminalSummary(serviceRegistry, { outputCount, fetchResult, timer }, dryRun)
            res.send(summary)

            if (dryRun.saveFile || dryRun.sendEmail) {
                const { report } = reports.initializeDryRunReport({
                    fetchResult,
                    totalProcessingTime: timer.totalElapsed(),
                    phaseTiming: timer.getPhaseBreakdown(),
                })
                const { reportHtmlOutputPath } = await reports.finalizeDryRunReport({
                    report,
                    fetchResult,
                    totalProcessingTime: timer.totalElapsed(),
                    phaseBreakdownThroughOutput: timer.getPhaseBreakdown(),
                    saveFile: dryRun.saveFile,
                    sendEmail: dryRun.sendEmail,
                })
                if (reportHtmlOutputPath) {
                    log.info(`Dry-run HTML report written to ${reportHtmlOutputPath}`)
                }
            }
        }

        const label = dryRun ? 'Dry-run analysis' : 'Account list operation'
        timer.end(`✓ ${label} completed successfully - ${outputCount ?? 0} account(s) processed`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        if (isPersistent && !(error instanceof ConnectorError)) {
            log.crash('Failed to list accounts', error as any)
        }
        throw error
    } finally {
        if (isPersistent) {
            await sources.releaseProcessLock()
        }
    }
}
