import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { AggregationTracker } from '../services/fusionService'
import { PipelineRunner } from './helpers/corePipeline'

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
    const { log } = serviceRegistry
    const tracker = new AggregationTracker()

    try {
        log.info('Starting aggregation')
        const result = await PipelineRunner.run(serviceRegistry, {
            mode: { kind: 'aggregation' },
            schema: input.schema,
            tracker,
            targetPhase: 'report',
        })

        if (!result.shouldContinue) return

        result.timer.end(`✓ Account list operation completed successfully - ${result.outputCount ?? 0} account(s) processed`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        // Unexpected errors are crashed via log.crash inside PipelineRunner.run
        throw error
    }
}
