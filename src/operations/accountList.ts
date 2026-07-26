import { ConnectorError, ConnectorErrorType, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { AggregationTracker } from '../services/fusionService'
import { FetchResult } from './helpers/accountListPhases'
import { parseDryRunInput } from './helpers/accountListHelpers'
import {
    PhaseOptions,
    setupPhase,
    fetchPhase,
    refreshPhase,
    processPhase,
    outputPhase,
    reportEpilogue,
} from './helpers/accountListPhases'

export { hydrateCorrelatedManagedAccountIdentities } from './helpers/accountListPhases'

/**
 * Account list operation — main entry point for identity fusion processing.
 *
 * Supports an optional dry-run mode via the dryRun input parameter:
 *   { dryRun: { enabled: true, saveFile?: boolean, sendEmail?: string | string[] } }
 *
 * When dry-run mode is active, the operation runs the full account-list pipeline
 * with write inhibition via DryRunApiAdapter, emits optional report artifacts
 * (file and/or email), streams account rows identical to persistent aggregation,
 * and sends a terminal summary object last.
 *
 * The pipeline (phases 1-5) is fallible; the report epilogue always runs so
 * that durable artifacts survive pipeline failures. Pipeline errors are
 * rethrown after the epilogue so failed runs are still marked failed.
 */
export const accountList = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    const { log, sources, config } = serviceRegistry
    const tracker = new AggregationTracker()
    const dryRun = parseDryRunInput(input)
    const isPersistent = !dryRun?.enabled

    if (dryRun?.enabled) {
        const recordingMode = config.recording?.mode ?? 'off'
        if (recordingMode !== 'off' || serviceRegistry.run.isRecordMode) {
            throw new ConnectorError(
                'Dry-run mode cannot be combined with recording mode. Disable recording or dry-run before running account list.',
                ConnectorErrorType.Generic
            )
        }
        serviceRegistry.activateDryRunMode()
    }
    const timer = log.timer()
    log.startOperationHeartbeat(() => serviceRegistry.getHeartbeatSnapshot())
    const streamProgress = { sent: 0 }
    let fetchResult: FetchResult | undefined
    let outputCount: number | undefined
    let runError: unknown

    try {
        try {
            log.info(dryRun ? 'Starting dry-run analysis' : 'Starting aggregation')

            const options: PhaseOptions = { isPersistent, tracker, streamProgress }

            log.phaseStart(1, 'Setup')
            if (!(await setupPhase(serviceRegistry, input.schema, options))) return
            timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

            log.phaseStart(2, 'Fetch')
            fetchResult = await fetchPhase(serviceRegistry, options)
            timer.phase('PHASE 2: Fetching data in parallel', 'info', 'Fetch')

            log.phaseStart(3, 'Refresh')
            await refreshPhase(serviceRegistry)
            timer.phase('PHASE 3: Refresh (fusion accounts)', 'info', 'Refresh')

            log.phaseStart(4, 'Process')
            await processPhase(serviceRegistry, options)
            timer.phase('PHASE 4: Process (identities, managed accounts, form reconciliation)', 'info', 'Process')

            log.phaseStart(5, 'Output')
            outputCount = await outputPhase(serviceRegistry, options)
            timer.phase('PHASE 5: Output (unique attributes, serialize & clean up memory)', 'info', 'Output')
        } catch (error) {
            runError = error
            log.warn(`Pipeline failed — running report epilogue before propagating: ${(error as Error).message}`)
        }

        const epilogueError = await reportEpilogue(serviceRegistry, {
            isPersistent,
            dryRun,
            fetchResult,
            outputCount,
            timer,
            runError,
        })
        runError = runError ?? epilogueError

        if (!sources.run.isRecordMode) {
            sources.clearFusionAccounts()
        } else {
            log.info('Fusion accounts cache retained for recording')
        }
        log.info('Account caches cleared from memory')

        if (runError) {
            if (runError instanceof ConnectorError) throw runError
            if (isPersistent) {
                log.crash('Failed to list accounts', runError as any)
            }
            throw runError
        }

        const label = dryRun ? 'Dry-run analysis' : 'Account list operation'
        timer.end(`✓ ${label} completed successfully - ${outputCount ?? 0} account(s) processed`)
    } finally {
        log.stopOperationHeartbeat()
        if (isPersistent) {
            await sources.releaseProcessLock()
        }
    }
}

