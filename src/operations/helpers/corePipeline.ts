import { ServiceRegistry } from '../../services/serviceRegistry'
import { SourceType } from '../../model/config'
import { generateReport } from './generateReport'
import { promiseAllBatched } from '../../services/fusionService/collections'
import { defaults } from '../../data/config/defaults'

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
        const reverseCorrelationStartedAt = Date.now()
        const reverseCorrelationCount = await sources.setupReverseCorrelationSources()
        if (reverseCorrelationCount > 0) {
            await schemas.setFusionAccountSchema(undefined)
            log.debug('Fusion account schema refreshed after reverse correlation setup')
            log.info(`Reverse correlation setup completed for ${reverseCorrelationCount} source(s)`)
            log.metric('reverseCorrelationSetup', reverseCorrelationStartedAt, { sources: reverseCorrelationCount })
        }
        const aggregateManagedSourcesStartedAt = Date.now()
        await sources.aggregateManagedSources()
        log.info('Managed sources aggregated')
        log.metric('aggregateManagedSources', aggregateManagedSourcesStartedAt, { sources: sources.managedSources.length })
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
    const { log, identities, sources, forms, fusion, messaging, config } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'
    const ownerIncluded = fusion.fusionReportOnAggregation || fusion.fusionOwnerIsGlobalReviewer

    log.info('Fetching identities, managed accounts, and dependencies')

    const fetchTasks: Array<Promise<void>> = [
        identities.fetchIdentities(),
        sources.fetchManagedAccounts(),
        sources.fetchFusionAccounts(),
        forms.fetchFormInstancesData(isPersistent),
    ]

    if (isPersistent) {
        fetchTasks.push(messaging.fetchDelayedAggregationSender())
    }

    const fetchAllStartedAt = Date.now()
    await Promise.all(fetchTasks)
    log.metric('fetchPhase.parallelFetch', fetchAllStartedAt, { taskCount: fetchTasks.length })

    // Form instance processing must run after managed accounts are loaded
    log.info('Processing fetched form data')
    const processFormDataStartedAt = Date.now()
    await forms.processFetchedFormData()
    log.metric('fetchPhase.processFormData', processFormDataStartedAt)

    if (ownerIncluded) {
        const globalOwnerFetchStartedAt = Date.now()
        const globalOwnerIds = await sources.fetchGlobalOwnerIdentityIds()
        const missingGlobalOwnerIds = globalOwnerIds.filter((id) => !identities.getIdentityById(id))
        const ownerFetchBatchSize = config.managedAccountsBatchSize ?? defaults.managedAccountsBatchSize
        await promiseAllBatched(
            missingGlobalOwnerIds,
            async (id) => {
                await identities.fetchIdentityById(id)
            },
            ownerFetchBatchSize
        )
        log.metric('fetchPhase.globalOwnerHydration', globalOwnerFetchStartedAt, {
            totalIds: globalOwnerIds.length,
            fetchedIds: missingGlobalOwnerIds.length,
            batchSize: ownerFetchBatchSize,
        })
    }

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
    await fusion.processFusionAccounts()

    log.info(`Refresh phase complete - ${sources.managedAccountsById.size} unprocessed account(s) remaining`)
}

/** Phase 4: Identity, decision, and managed account processing (including form reconciliation). */
export async function processPhase(serviceRegistry: ServiceRegistry, options: CorePipelineOptions): Promise<void> {
    const { log, fusion, identities, sources } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'

    log.info('Processing identities')
    await fusion.processIdentities()

    log.info('Processing fusion identity decisions (new identity)')
    await fusion.processFusionIdentityDecisions()

    identities.clear()
    log.info('Identities cache cleared from memory')

    log.info('Processing managed accounts (Match)')
    await fusion.processManagedAccounts()

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

    await fusion.refreshUniqueAttributes()

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
    const { fusion, sources } = serviceRegistry

    // We can generate the report in memory for customReport, but only write/send if persistent
    if (!fusion.fusionReportOnAggregation) return

    if (sources.hasFusionSource) {
        const fusionOwner = sources.fusionSourceOwner
        if (fusionOwner && fusionOwner.id) {
            const fusionOwnerAccount = fusion.getFusionIdentity(fusionOwner.id)
            if (fusionOwnerAccount) {
                // Aggregation reports: stats only for non-matches; per-account unmatched rows are omitted (see generateReport includeNonMatches).
                await generateReport(fusionOwnerAccount, false, serviceRegistry, {
                    identitiesFound: fetchResult.identitiesFound,
                    managedAccountsFound: fetchResult.managedAccountsFound,
                    managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
                    managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
                    managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
                    totalProcessingTime: timer.totalElapsed(),
                    phaseTiming: timer.getPhaseBreakdown(),
                })
            }
        }
    }
}

/** Phase 6: Cleanup, send accounts to platform, save state. Only mostly used by accountList. */
export async function outputPhase(serviceRegistry: ServiceRegistry, options: CorePipelineOptions): Promise<number> {
    const { log, fusion, forms, sources, attributes, messaging, res } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'

    sources.clearManagedAccounts()

    if (isPersistent) {
        await forms.cleanUpForms()
        log.info('Form cleanup queued')
    }

    let count = 0
    if (isPersistent) {
        log.info('Sending accounts to platform')
        const sendAccountsStartedAt = Date.now()
        count = await fusion.forEachISCAccount((account) => res.send(account))
        log.info(`Sent ${count} account(s) to platform`)
        log.metric('outputPhase.sendAccounts', sendAccountsStartedAt, { count })

        const saveAttributesStartedAt = Date.now()
        await attributes.saveState()
        log.info('Attribute state saved')
        log.metric('outputPhase.saveAttributeState', saveAttributesStartedAt)
        const saveCumulativeCountStartedAt = Date.now()
        await sources.saveBatchCumulativeCount()
        log.info('Batch cumulative count saved')
        log.metric('outputPhase.saveBatchCumulativeCount', saveCumulativeCountStartedAt)
    }

    sources.clearFusionAccounts()
    log.info('Account caches cleared from memory')

    if (isPersistent) {
        await sources.aggregateDelayedSources(async ({ sourceId, delayMinutes, disableOptimization }) => {
            await messaging.scheduleDelayedAggregation({
                sourceId,
                delayMinutes,
                disableOptimization,
            })
        })

        await forms.awaitPendingDeleteOperations()
        log.info('Queued form deletions completed')
    }

    return count
}


