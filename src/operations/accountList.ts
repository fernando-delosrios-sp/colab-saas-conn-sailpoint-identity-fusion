import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { softAssert } from '../utils/assert'
import { generateReport } from './helpers/generateReport'

// ============================================================================
// Phase Functions
// ============================================================================

/**
 * Phase 1: Setup and initialization.
 * @returns true if processing should continue, false on reset (lock still acquired).
 */
async function setupPhase(serviceRegistry: ServiceRegistry, schema: any): Promise<boolean> {
    const { log, fusion, forms, schemas, sources, attributes, config } = serviceRegistry

    await sources.fetchAllSources()
    log.info(`Loaded ${sources.managedSources.length} managed source(s)`)

    await sources.setProcessLock()

    if (fusion.isReset()) {
        log.info('Reset flag detected, disabling reset and exiting')
        await forms.deleteExistingForms()
        await fusion.disableReset()
        await fusion.resetState()
        await sources.resetBatchCumulativeCount()
        return false
    }

    await schemas.setFusionAccountSchema(schema)
    log.info('Fusion account schema set successfully')

    const reverseCorrelationSources = config.sources.filter((sc) => sc.correlationMode === 'reverse')
    if (reverseCorrelationSources.length > 0) {
        const schemaAttrNames = await schemas.getManagedSourceSchemaAttributeNames()
        // Run reverse setup sequentially to avoid concurrent updates on the same
        // Fusion identity profile transforms, which can cause non-deterministic misses.
        for (const sc of reverseCorrelationSources) {
            await sources.ensureReverseCorrelationSetup(sc, schemaAttrNames)
        }
        await schemas.setFusionAccountSchema(undefined)
        log.info('Fusion account schema refreshed after reverse correlation setup')
        log.info(`Reverse correlation setup completed for ${reverseCorrelationSources.length} source(s)`)
    }

    await sources.aggregateManagedSources()
    log.info('Managed sources aggregated')

    await attributes.initializeCounters()
    log.info('Attribute counters initialized')

    return true
}

interface FetchResult {
    identitiesFound: number
    managedAccountsFound: number
    managedAccountsFoundAuthoritative: number
    managedAccountsFoundRecord: number
    managedAccountsFoundOrphan: number
}

/** Phase 2: Fetch all data in parallel. */
async function fetchPhase(serviceRegistry: ServiceRegistry): Promise<FetchResult> {
    const { log, identities, sources, messaging, forms, fusion } = serviceRegistry

    log.info('Fetching fusion accounts, identities, managed accounts, form data, and sender')
    await Promise.all([
        sources.fetchFusionAccounts(),
        identities.fetchIdentities(),
        sources.fetchManagedAccounts(),
        messaging.fetchSender(),
        forms.fetchFormData(),
    ])

    const identitiesFound = identities.identityCount
    const managedAccountsFound = sources.managedAccountsById.size
    let managedAccountsFoundAuthoritative = 0
    let managedAccountsFoundRecord = 0
    let managedAccountsFoundOrphan = 0

    for (const account of sources.managedAccountsById.values()) {
        const sourceType = sources.getSourceByName(account.sourceName ?? '')?.sourceType ?? 'authoritative'
        if (sourceType === 'record') {
            managedAccountsFoundRecord++
        } else if (sourceType === 'orphan') {
            managedAccountsFoundOrphan++
        } else {
            managedAccountsFoundAuthoritative++
        }
    }
    log.info(`Loaded ${sources.fusionAccountCount} fusion account(s), ${identitiesFound} identities, ${managedAccountsFound} managed account(s)`)

    const fusionOwner = sources.fusionSourceOwner
    if (fusion.fusionReportOnAggregation) {
        const fusionOwnerIdentity = identities.getIdentityById(fusionOwner.id)
        if (!fusionOwnerIdentity) {
            log.info(`Fusion owner identity missing. Fetching identity: ${fusionOwner.id}`)
            await identities.fetchIdentityById(fusionOwner.id!)
        }
    }

    return {
        identitiesFound,
        managedAccountsFound,
        managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord,
        managedAccountsFoundOrphan,
    }
}

/** Phase 3: Work queue depletion -- process and remove accounts from the queue. */
async function processPhase(serviceRegistry: ServiceRegistry): Promise<void> {
    const { log, fusion, identities, sources } = serviceRegistry

    log.info('Processing existing fusion accounts')
    await fusion.processFusionAccounts()

    log.info('Processing identities')
    await fusion.processIdentities()

    identities.clear()
    log.info('Identities cache cleared from memory')

    log.info('Processing fusion identity decisions (new identity)')
    await fusion.processFusionIdentityDecisions()

    log.info('Processing managed accounts (deduplication)')
    await fusion.processManagedAccounts()

    log.info('Reconciling pending form state (candidates + reviewer links)')
    fusion.reconcilePendingFormState()

    await fusion.refreshUniqueAttributes()

    log.info(`Work queue processing complete - ${sources.managedAccountsById.size} unprocessed account(s) remaining`)
}

/** Phase 4: Generate fusion report (conditional). */
async function reportPhase(
    serviceRegistry: ServiceRegistry,
    fetchResult: FetchResult,
    timer: ReturnType<ServiceRegistry['log']['timer']>
): Promise<void> {
    const { fusion, sources } = serviceRegistry
    if (!fusion.fusionReportOnAggregation) return

    const fusionOwner = sources.fusionSourceOwner
    const fusionOwnerAccount = fusion.getFusionIdentity(fusionOwner.id!)
    softAssert(fusionOwnerAccount, 'Fusion owner account not found')

    if (fusionOwnerAccount) {
        await generateReport(fusionOwnerAccount, false, serviceRegistry, {
            identitiesFound: fetchResult.identitiesFound,
            managedAccountsFound: fetchResult.managedAccountsFound,
            managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
            managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
            managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
            totalProcessingTime: timer.totalElapsed(),
        })
    }
}

/** Phase 5: Cleanup, send accounts to platform, save state. */
async function outputPhase(serviceRegistry: ServiceRegistry): Promise<number> {
    const { log, fusion, forms, sources, attributes, res } = serviceRegistry

    fusion.clearAnalyzedAccounts()
    sources.clearManagedAccounts()
    await forms.cleanUpForms()
    log.info('Form cleanup completed')

    log.info('Sending accounts to platform')
    const count = await fusion.forEachISCAccount((account) => res.send(account))
    log.info(`Sent ${count} account(s) to platform`)

    await attributes.saveState()
    log.info('Attribute state saved')
    await sources.saveBatchCumulativeCount()
    log.info('Batch cumulative count saved')

    sources.clearFusionAccounts()
    log.info('Account caches cleared from memory')

    await sources.aggregateDelayedSources()

    return count
}

// ============================================================================
// Main Entry Point
// ============================================================================

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
export const accountList = async (
    serviceRegistry: ServiceRegistry,
    input: StdAccountListInput,
) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, sources } = serviceRegistry

    let processLockAcquired = false

    try {
        const timer = log.timer()
        log.info('Starting aggregation')

        const shouldContinue = await setupPhase(serviceRegistry, input.schema)
        processLockAcquired = true
        if (!shouldContinue) return
        timer.phase('PHASE 1: Setup and initialization')

        const fetchResult = await fetchPhase(serviceRegistry)
        timer.phase('PHASE 2: Fetching data in parallel')

        await processPhase(serviceRegistry)
        timer.phase('PHASE 3: Work queue depletion and form reconciliation')

        await reportPhase(serviceRegistry, fetchResult, timer)
        timer.phase('PHASE 4: Generating fusion report')

        const count = await outputPhase(serviceRegistry)
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
