import { ConnectorError, ConnectorErrorType, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { AggregationTracker } from '../services/fusionService'
import { parseDryRunInput, type FetchResult } from './helpers/accountListHelpers'
import { runAccountListPhases } from './helpers/accountListOrchestration'
import { reportEpilogue } from './helpers/accountListPhases'

export { hydrateCorrelatedManagedAccountIdentities } from './helpers/accountListPhases'

/**
 * Account list operation — main entry point for identity fusion processing.
 *
 * Supports an optional dry-run mode via the dryRun input parameter:
 *   { dryRun: { enabled: true, saveFile?: boolean, sendEmail?: string | string[] } }
 *
 * When dry-run mode is active, the operation runs the full account-list pipeline
 * with write inhibition via DryRunApiAdapter, streams `StdAccountListOutput` objects identical to
 * persistent aggregation, emits optional report artifacts (file and/or email),
 * and logs a run summary to the console.
 *
 * The pipeline (phases 1-5) is fallible; the report epilogue always runs so
 * that durable artifacts survive pipeline failures. Pipeline errors are
 * rethrown after the epilogue so failed runs are still marked failed.
 */
export const accountList = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    const { log, sources } = serviceRegistry
    const dryRun = parseDryRunInput(input)
    const isPersistent = !dryRun?.enabled

    // --- Mode resolution ---
    if (dryRun?.enabled) {
        const recordingMode = serviceRegistry.config.recording?.mode ?? 'off'
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
    const phaseResult: { fetchResult?: FetchResult; outputCount?: number; continued: boolean } = {
        continued: true,
    }
    let runError: unknown

    try {
        // --- Pipeline (phases 1–5) ---
        try {
            log.detail({ action: dryRun ? 'start dry-run analysis' : 'start aggregation' })
            await runAccountListPhases(
                serviceRegistry,
                {
                    isPersistent,
                    tracker: new AggregationTracker(),
                    streamProgress: { sent: 0 },
                    schema: input.schema,
                },
                { log, timer, logPhases: true, result: phaseResult }
            )
            if (!phaseResult.continued) return
        } catch (error) {
            runError = error
            log.warn(`Pipeline failed — running report epilogue before propagating: ${(error as Error).message}`)
        }

        const fetchResult = phaseResult.fetchResult
        const outputCount = phaseResult.outputCount

        // --- Epilogue (always) ---
        const epilogueError = await reportEpilogue(serviceRegistry, {
            isPersistent,
            dryRun,
            fetchResult,
            outputCount,
            timer,
            runError,
        })
        runError = runError ?? epilogueError

        // --- Cleanup + outcome ---
        if (!sources.run.isRecordMode) {
            sources.clearFusionAccounts()
        } else {
            log.detail({ cache: 'fusion accounts retained for recording' })
        }
        log.detail({ action: 'account caches cleared from memory' })

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

