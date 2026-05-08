import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import {
    type CorePipelineOptions,
    executeSharedPipelinePhases,
    uniqueAttributesPhase,
    reportPhase,
    outputPhase,
} from './helpers/corePipeline'

/**
 * Account list operation - Main entry point for identity fusion processing.
 *
 * Processing Flow (Work Queue Pattern):
 * 1. SETUP — Load sources, schema, and initialize attribute counters
 * 2. FETCH — Load fusion accounts, identities, managed accounts, form data, and sender in parallel
 * 3. REFRESH — Existing fusion accounts
 * 4. PROCESS — Identities, decisions, managed accounts, reconcile form state
 * 5. UNIQUE ATTRIBUTES — Unique attribute refresh
 * 6. OUTPUT — Cleanup, send accounts to platform, save state
 * 7. REPORT — Generate fusion report (conditional)
 */
export const accountList = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, sources } = serviceRegistry
    const options: CorePipelineOptions = { mode: { kind: 'aggregation' } }

    let processLockAcquired = false

    try {
        const timer = log.timer()
        log.info('Starting aggregation')

        const { shouldContinue, fetchResult } = await executeSharedPipelinePhases(
            serviceRegistry,
            input.schema,
            options,
            timer
        )
        processLockAcquired = true
        if (!shouldContinue || !fetchResult) return

        await uniqueAttributesPhase(serviceRegistry, options)
        timer.phase('PHASE 5: Unique attributes', 'info', 'Unique attributes')

        const count = await outputPhase(serviceRegistry, options)
        timer.phase('PHASE 6: Output (send accounts, persist state)', 'info', 'Output')

        await reportPhase(serviceRegistry, fetchResult, timer, options)
        timer.phase('PHASE 7: Report (fusion report)', 'info', 'Report')

        // Report generation consumes analyzed-account slices; clear them after report/output complete.
        serviceRegistry.fusion.clearAnalyzedAccounts()
        timer.end(`✓ Account list operation completed successfully - ${count} account(s) processed`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash('Failed to list accounts', error)
    } finally {
        if (processLockAcquired) {
            await sources.releaseProcessLock()
        }
    }
}
