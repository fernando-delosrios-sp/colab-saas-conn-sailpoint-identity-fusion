import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import {
    type CorePipelineOptions,
    setupPhase,
    fetchPhase,
    processPhase,
    reportPhase,
    outputPhase,
} from './helpers/corePipeline'

/**
 * Account list operation - Main entry point for identity fusion processing.
 *
 * Processing Flow (Work Queue Pattern):
 * 1. SETUP: Load sources, schema, and initialize attribute counters
 * 2. FETCH: Load fusion accounts, identities, managed accounts, form data, and sender in parallel
 * 3. PROCESS: Work queue depletion (fusion accounts -> identities -> decisions -> managed -> reconcile -> unique attrs)
 * 4. REPORT: Generate fusion report (conditional)
 * 5. OUTPUT: Cleanup, send accounts to platform, save state
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
        timer.phase('PHASE 1: Setup and initialization')

        const fetchResult = await fetchPhase(serviceRegistry, options)
        timer.phase('PHASE 2: Fetching data in parallel')

        await processPhase(serviceRegistry, options)
        timer.phase('PHASE 3: Work queue depletion and form reconciliation')

        await reportPhase(serviceRegistry, fetchResult, timer, options)
        timer.phase('PHASE 4: Generating fusion report')

        const count = await outputPhase(serviceRegistry, options)
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
