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

    if (fusion.isReset()) {
        log.info('Reset flag detected, disabling reset and exiting')
        if (isPersistent) {
            await applyPersistentFusionReset(serviceRegistry)
        }
        return false
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
        const reverseCorrelationSources = config.sources.filter((sc) => sc.correlationMode === 'reverse')
        if (reverseCorrelationSources.length > 0) {
            const reverseCorrelationStartedAt = Date.now()
            const schemaAttrNames = await schemas.getManagedSourceSchemaAttributeNames()
            // Reverse-correlation setup mutates shared connector/source state and is kept serial
            // to preserve deterministic ordering and avoid cross-source readiness races.
            for (const sc of reverseCorrelationSources) {
                try {
                    await sources.ensureReverseCorrelationSetup(sc, schemaAttrNames)
                } catch (error) {
                    log.error(
                        `Reverse correlation setup failed for source "${sc.name}" (attribute="${sc.correlationAttribute ?? 'unset'}"): ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    )
                    throw error
                }
            }
            await schemas.setFusionAccountSchema(undefined)
            log.debug('Fusion account schema refreshed after reverse correlation setup')
            log.info(`Reverse correlation setup completed for ${reverseCorrelationSources.length} source(s)`)
            log.info(
                `Performance metric: reverseCorrelationSetup durationMs=${Date.now() - reverseCorrelationStartedAt} sources=${reverseCorrelationSources.length}`
            )
        }
        const aggregateManagedSourcesStartedAt = Date.now()
        await sources.aggregateManagedSources()
        log.info('Managed sources aggregated')
        log.info(
            `Performance metric: aggregateManagedSources durationMs=${Date.now() - aggregateManagedSourcesStartedAt} sources=${sources.managedSources.length}`
        )
    }

    await attributes.initializeCounters()
    log.info('Attribute counters initialized')

    return true
}

/** Phase 2: Fetch all data in parallel. */
export async function fetchPhase(serviceRegistry: ServiceRegistry, options: CorePipelineOptions): Promise<FetchResult> {
    const { log, identities, sources, messaging, forms, fusion } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'

    log.info('Fetching identities, managed accounts, and dependencies')

    const fetchTasks: Array<Promise<void>> = [
        identities.fetchIdentities(),
        sources.fetchManagedAccounts(),
        sources.fetchFusionAccounts(),
        forms.fetchFormInstancesData(isPersistent),
    ]

    if (isPersistent) {
        fetchTasks.push(messaging.fetchSender())
        fetchTasks.push(messaging.fetchDelayedAggregationSender())
    }

    const fetchAllStartedAt = Date.now()
    await Promise.all(fetchTasks)
    log.info(`Performance metric: fetchPhase.parallelFetch durationMs=${Date.now() - fetchAllStartedAt} taskCount=${fetchTasks.length}`)

    // Form instance processing must run after managed accounts are loaded
    log.info('Processing fetched form data')
    const processFormDataStartedAt = Date.now()
    await forms.processFetchedFormData()
    log.info(`Performance metric: fetchPhase.processFormData durationMs=${Date.now() - processFormDataStartedAt}`)

    if (fusion.fusionReportOnAggregation || fusion.fusionOwnerIsGlobalReviewer) {
        const globalOwnerFetchStartedAt = Date.now()
        const globalOwnerIds = await sources.fetchGlobalOwnerIdentityIds()
        const missingGlobalOwnerIds = globalOwnerIds.filter((id) => !identities.getIdentityById(id))
        const limiters = serviceRegistry.client.getLimiters()
        await limiters.runAll(
            missingGlobalOwnerIds,
            async (id) => {
                await identities.fetchIdentityById(id)
            }
        )
        log.info(
            `Performance metric: fetchPhase.globalOwnerHydration durationMs=${
                Date.now() - globalOwnerFetchStartedAt
            } totalIds=${globalOwnerIds.length} fetchedIds=${missingGlobalOwnerIds.length}`
        )
    }

    const identitiesFound = identities.identityCount
    const managedAccountsFound = sources.managedAccountsById.size
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
    log.info(
        `Loaded ${sources.fusionAccountCount} fusion account(s), ${identitiesFound} identities, ${managedAccountsFound} managed account(s)`
    )

    return {
        identitiesFound,
        managedAccountsFound,
        managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord,
        managedAccountsFoundOrphan,
    }
}

/** Phase 3: Work queue depletion -- process and remove accounts from the queue. */
export async function processPhase(serviceRegistry: ServiceRegistry, options: CorePipelineOptions): Promise<void> {
    const { log, fusion, identities, sources } = serviceRegistry
    const isPersistent = options.mode.kind === 'aggregation'

    log.info('Processing existing fusion accounts')
    await fusion.processFusionAccounts()

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

    await fusion.refreshUniqueAttributes()

    log.info(`Work queue processing complete - ${sources.managedAccountsById.size} unprocessed account(s) remaining`)
}

/** Phase 4: Generate fusion report (conditional). */
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
                })
            }
        }
    }
}

/** Phase 5: Cleanup, send accounts to platform, save state. Only mostly used by accountList. */
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
        log.info(`Performance metric: outputPhase.sendAccounts durationMs=${Date.now() - sendAccountsStartedAt} count=${count}`)

        const saveAttributesStartedAt = Date.now()
        await attributes.saveState()
        log.info('Attribute state saved')
        log.info(`Performance metric: outputPhase.saveAttributeState durationMs=${Date.now() - saveAttributesStartedAt}`)
        const saveCumulativeCountStartedAt = Date.now()
        await sources.saveBatchCumulativeCount()
        log.info('Batch cumulative count saved')
        log.info(
            `Performance metric: outputPhase.saveBatchCumulativeCount durationMs=${Date.now() - saveCumulativeCountStartedAt}`
        )
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
