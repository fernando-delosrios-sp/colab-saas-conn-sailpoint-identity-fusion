import { ServiceRegistry } from '../../services/serviceRegistry'
import { SourceType } from '../../model/config'
import { generateReport } from './generateReport'

export type PipelineMode =
    | { kind: 'aggregation' } // full persistent run — accountList (includes optional aggregation report)
    | { kind: 'dry-run' } // non-persistent analysis — customReport, reportAction's mini-pipeline

export interface CorePipelineOptions {
    mode: PipelineMode
}

export interface FetchResult {
    identitiesFound: number
    managedAccountsFound: number
    managedAccountsFoundAuthoritative: number
    managedAccountsFoundRecord: number
    managedAccountsFoundOrphan: number
}

async function applyPersistentFusionReset(serviceRegistry: ServiceRegistry): Promise<void> {
    const { forms, fusion, sources } = serviceRegistry
    await forms.deleteExistingForms()
    await fusion.disableReset()
    await fusion.resetState()
    await sources.resetBatchCumulativeCount()
}

/**
 * Phase 1: Setup and initialization.
 * @returns true if processing should continue, false on reset.
 */
export async function setupPhase(
    serviceRegistry: ServiceRegistry,
    schema: any,
    options: CorePipelineOptions
): Promise<boolean> {
    const { log, fusion, schemas, sources, attributes, config } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'
    const isReset = fusion.isReset()
    const forceAttributeRefresh = isPersistent && config.forceAttributeRefresh

    await sources.fetchAllSources(isPersistent)
    log.info(`Loaded ${sources.managedSources.length} managed source(s)`)
    if (!sources.hasFusionSource) {
        throw new Error(
            'Fusion source not found. The connector instance could not locate its own source in ISC. Verify the connector is properly deployed.'
        )
    }

    if (isPersistent) {
        await sources.setProcessLock()
    }

    if (isReset) {
        log.info('Reset flag detected, disabling reset and exiting')
        if (isPersistent) {
            await applyPersistentFusionReset(serviceRegistry)
        }
        return false
    }

    if (forceAttributeRefresh) {
        log.info('Force attribute refresh flag detected, disabling flag for next run')
        await fusion.disableForceAttributeRefresh()
    }

    if (schema) {
        await schemas.setFusionAccountSchema(schema)
    } else {
        await schemas.loadFusionAccountSchemaFromSource()
        log.info('Input schema not provided; loaded fusion account schema from source')
    }
    log.info('Fusion account schema set successfully')

    if (isPersistent) {
        sources.clearReverseCorrelationReadinessCache()
        const reverseCorrelationOp = log.track('reverseCorrelationSetup')
        const reverseCorrelationCount = await sources.setupReverseCorrelationSources()
        if (reverseCorrelationCount > 0) {
            await schemas.setFusionAccountSchema(undefined)
            log.debug('Fusion account schema refreshed after reverse correlation setup')
            log.info(`Reverse correlation setup completed for ${reverseCorrelationCount} source(s)`)
            reverseCorrelationOp.done({ sources: reverseCorrelationCount })
        }
        const aggregateManagedSourcesOp = log.track('aggregateManagedSources')
        await sources.aggregateManagedSources()
        log.info('Managed sources aggregated')
        aggregateManagedSourcesOp.done({ sources: sources.managedSources.length })
    }

    await attributes.initializeCounters()
    log.info('Attribute counters initialized')

    return true
}

function countManagedAccountsByType(sources: ServiceRegistry['sources']): {
    managedAccountsFound: number
    managedAccountsFoundAuthoritative: number
    managedAccountsFoundRecord: number
    managedAccountsFoundOrphan: number
} {
    let managedAccountsFoundAuthoritative = 0
    let managedAccountsFoundRecord = 0
    let managedAccountsFoundOrphan = 0

    for (const account of sources.managedAccountsById.values()) {
        const sourceType = sources.getSourceByNameSafe(account.sourceName)?.sourceType ?? SourceType.Authoritative
        if (sourceType === SourceType.Record) {
            managedAccountsFoundRecord++
        } else if (sourceType === SourceType.Orphan) {
            managedAccountsFoundOrphan++
        } else {
            managedAccountsFoundAuthoritative++
        }
    }

    return {
        managedAccountsFound: sources.managedAccountsById.size,
        managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord,
        managedAccountsFoundOrphan,
    }
}

/** Phase 2: Fetch all data in parallel. */
export async function fetchPhase(serviceRegistry: ServiceRegistry, options: CorePipelineOptions): Promise<FetchResult> {
    const { log, identities, sources, forms, fusion, messaging } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'
    const ownerIncluded = fusion.fusionReportOnAggregation || fusion.fusionOwnerIsGlobalReviewer

    log.info('Fetching identities, managed accounts, and dependencies')

    const ownerIds = ownerIncluded ? await sources.fetchGlobalOwnerIdentityIds() : []

    const fetchTasks: Array<Promise<void>> = [
        identities.fetchIdentities(ownerIds),
        sources.fetchManagedAccounts(),
        sources.fetchFusionAccounts(),
        forms.fetchFormInstancesData(isPersistent),
    ]

    if (isPersistent) {
        fetchTasks.push(messaging.fetchDelayedAggregationSender())
    }

    const fetchAllOp = log.track('fetchPhase.parallelFetch')
    await Promise.all(fetchTasks)
    fetchAllOp.done({ taskCount: fetchTasks.length })

    // Form instance processing must run after managed accounts are loaded
    log.info('Processing fetched form data')
    const processFormDataOp = log.track('fetchPhase.processFormData')
    await forms.processFetchedFormData()
    processFormDataOp.done()

    const {
        managedAccountsFound,
        managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord,
        managedAccountsFoundOrphan,
    } = countManagedAccountsByType(sources)

    log.info(
        `Loaded ${sources.fusionAccountCount} fusion account(s), ${identities.identityCount} identities, ${managedAccountsFound} managed account(s)`
    )

    return {
        identitiesFound: identities.identityCount,
        managedAccountsFound,
        managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord,
        managedAccountsFoundOrphan,
    }
}

/** Phase 3: Fusion account processing (existing fusion accounts). */
export async function refreshPhase(serviceRegistry: ServiceRegistry, options: CorePipelineOptions): Promise<void> {
    void options
    const { log, fusion, sources } = serviceRegistry

    log.info('Refreshing Fusion accounts')
    const refreshOp = log.track('refreshPhase.processFusionAccounts')
    const processedFusionAccounts = await fusion.processFusionAccounts()
    refreshOp.done({ count: processedFusionAccounts.length })

    log.info(`Refresh phase complete - ${sources.managedAccountsById.size} unprocessed account(s) remaining`)
}

/** Phase 4: Identity, decision, and managed account processing (including form reconciliation). */
export async function processPhase(serviceRegistry: ServiceRegistry, options: CorePipelineOptions): Promise<void> {
    const { log, fusion, identities, sources } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'

    log.info('Processing identities')
    const identitiesOp = log.track('FusionService.processIdentities')
    await fusion.processIdentities()
    identitiesOp.done({ count: identities.identityCount })

    log.info('Processing fusion identity decisions (new identity)')
    const decisionsOp = log.track('FusionService.processFusionIdentityDecisions')
    const decisions = await fusion.processFusionIdentityDecisions()
    decisionsOp.done({ count: decisions.length })

    identities.clear()
    log.info('Identities cache cleared from memory')

    log.info('Processing managed accounts (Match)')
    await fusion.initializeManagedAccountProcessing()
    await fusion.processCorrelatedManagedAccounts()
    const managedAccountsOp = log.track('FusionService.processManagedAccounts')
    const { processed, matchScoringMs } = await fusion.processUncorrelatedManagedAccounts()
    managedAccountsOp.done({ analyzed: processed, matchScoringMs })

    if (isPersistent) {
        log.info('Waiting for pending disable operations')
        await fusion.awaitPendingDisableOperations()
    }

    log.info('Reconciling pending form state (candidates + reviewer links)')
    fusion.reconcilePendingFormState()

    log.info(`Process phase complete - ${sources.managedAccountsById.size} unprocessed account(s) remaining`)
}

/** Phase 5: Unique attribute refresh. */
export async function uniqueAttributesPhase(
    serviceRegistry: ServiceRegistry,
    options: CorePipelineOptions
): Promise<void> {
    void options
    const { log, fusion, sources } = serviceRegistry

    const refreshOp = log.track('FusionService.refreshUniqueAttributes')
    const count = await fusion.refreshUniqueAttributes()
    refreshOp.done({ count })

    log.info(`Work queue processing complete - ${sources.managedAccountsById.size} unprocessed account(s) remaining`)
}

/**
 * Phase 5: Output preparation.
 * - Aggregation mode: default unique-attribute refresh.
 * - Dry-run mode: allows command-specific preparation while keeping a shared phase boundary.
 */
export async function outputPreparationPhase(
    serviceRegistry: ServiceRegistry,
    options: CorePipelineOptions
): Promise<void> {
    await uniqueAttributesPhase(serviceRegistry, options)
}

/** Phase 7: Generate fusion report (conditional). */
export async function reportPhase(
    serviceRegistry: ServiceRegistry,
    fetchResult: FetchResult,
    timer: ReturnType<ServiceRegistry['log']['timer']>,
    options: CorePipelineOptions
): Promise<void> {
    void options
    const { log, fusion } = serviceRegistry

    if (!fusion.fusionReportOnAggregation) return

    log.info('Generating aggregation report')
    const reportOp = log.track('reportPhase.generateReport')

    const stats = {
        identitiesFound: fetchResult.identitiesFound,
        managedAccountsFound: fetchResult.managedAccountsFound,
        managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
        managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
        totalProcessingTime: timer.totalElapsed(),
        phaseTiming: timer.getPhaseBreakdown(),
    }

    // Aggregation reports: stats only for non-matches; per-account unmatched rows are omitted (see generateReport includeNonMatches).
    await generateReport(false, serviceRegistry, stats)

    reportOp.done()
}

async function sendAccountsToPlatform(
    fusion: ServiceRegistry['fusion'],
    res: ServiceRegistry['res']
): Promise<{ sent: number; eligible: number }> {
    return fusion.forEachISCAccount((account) => res.send(account))
}

async function savePersistentState(
    attributes: ServiceRegistry['attributes'],
    sources: ServiceRegistry['sources']
): Promise<void> {
    await attributes.saveState()
    await sources.saveBatchCumulativeCount()
}

async function scheduleDelayedAggregations(
    sources: ServiceRegistry['sources'],
    messaging: ServiceRegistry['messaging']
): Promise<void> {
    await sources.aggregateDelayedSources((params) => messaging.scheduleDelayedAggregation(params))
}

async function completeFormCleanup(forms: ServiceRegistry['forms']): Promise<void> {
    await forms.cleanUpForms()
}

async function finalizeFormOperations(forms: ServiceRegistry['forms']): Promise<void> {
    await forms.awaitPendingDeleteOperations()
}

/** Phase 6: Cleanup, send accounts to platform, save state. Only mostly used by accountList. */
export async function outputPhase(serviceRegistry: ServiceRegistry, options: CorePipelineOptions): Promise<number> {
    const { log, fusion, forms, sources, attributes, messaging, res } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'

    sources.clearManagedAccounts()

    if (!isPersistent) {
        sources.clearFusionAccounts()
        log.info('Account caches cleared from memory')
        return 0
    }

    const formCleanupOp = log.track('outputPhase.formCleanup')
    await completeFormCleanup(forms)
    log.info('Form cleanup queued')
    formCleanupOp.done()

    log.info('Sending accounts to platform')
    const sendAccountsOp = log.track('outputPhase.sendAccounts')
    const { sent, eligible } = await sendAccountsToPlatform(fusion, res)
    log.info(`Sent ${sent} account(s) to platform`)
    sendAccountsOp.done({ sent, eligible })

    const saveStateOp = log.track('outputPhase.savePersistentState')
    await savePersistentState(attributes, sources)
    log.info('Attribute state saved')
    log.info('Batch cumulative count saved')
    saveStateOp.done()

    sources.clearFusionAccounts()
    log.info('Account caches cleared from memory')

    const scheduleAggregationOp = log.track('outputPhase.scheduleDelayedAggregations')
    await scheduleDelayedAggregations(sources, messaging)
    scheduleAggregationOp.done()

    await finalizeFormOperations(forms)
    log.info('Queued form deletions completed')

    return sent
}


