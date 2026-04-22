import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import {
    type CorePipelineOptions,
    setupPhase,
    fetchPhase,
    refreshPhase,
    processPhase,
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

        const shouldContinue = await setupPhase(serviceRegistry, input.schema, options)
        processLockAcquired = true
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
