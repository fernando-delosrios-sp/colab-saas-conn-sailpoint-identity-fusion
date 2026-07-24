import { ServiceRegistry } from '../../services/serviceRegistry'
import { SourceType } from '../../model/config'
import { AggregationTracker } from '../../services/fusionService'
import { AggregationStats } from '../../services/fusionService/types'
import { FusionAccount } from '../../model/account'
import { generateReport } from './generateReport'
import { buildTerminalSummary, DryRunInput } from './accountListHelpers'

export interface PhaseOptions {
    isPersistent: boolean
    tracker?: AggregationTracker
    streamProgress?: { sent: number }
}

export interface FetchResult {
    identitiesFound: number
    managedAccountsFound: number
    managedAccountsFoundAuthoritative: number
    managedAccountsFoundRecord: number
    managedAccountsFoundOrphan: number
}

function createEmptyFetchResult(): FetchResult {
    return {
        identitiesFound: 0,
        managedAccountsFound: 0,
        managedAccountsFoundAuthoritative: 0,
        managedAccountsFoundRecord: 0,
        managedAccountsFoundOrphan: 0,
    }
}

export function fetchResultToAggregationStats(
    fetchResult: FetchResult,
    timer: ReturnType<ServiceRegistry['log']['timer']>
): AggregationStats {
    return {
        identitiesFound: fetchResult.identitiesFound,
        managedAccountsFound: fetchResult.managedAccountsFound,
        managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
        managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
        totalProcessingTime: timer.totalElapsed(),
        phaseTiming: timer.getPhaseBreakdown(),
    }
}

export async function hydrateCorrelatedManagedAccountIdentities(deps: {
    managedAccounts: Iterable<{ identityId?: string }>
    fusionAccounts: Iterable<FusionAccount>
    managedAccountsByKey: Map<string, { identityId?: string }>
    getIdentity: (id: string) => { protected?: boolean } | undefined
    hydrateMissingIdentitiesById: (ids: string[]) => Promise<void>
}): Promise<{ hydrated: number; applied: number }> {
    const distinctIds = new Set<string>()
    for (const managed of deps.managedAccounts) {
        const id = managed.identityId
        if (id) distinctIds.add(id)
    }
    if (distinctIds.size === 0) return { hydrated: 0, applied: 0 }

    await deps.hydrateMissingIdentitiesById(Array.from(distinctIds))

    let applied = 0
    for (const fusionAccount of deps.fusionAccounts) {
        if (fusionAccount.identityInfo) continue
        const originKey = fusionAccount.originAccountId
        if (!originKey) continue
        const managed = deps.managedAccountsByKey.get(originKey)
        const identityId = managed?.identityId
        if (!identityId) continue
        const identity = deps.getIdentity(identityId)
        if (!identity || identity.protected) continue
        fusionAccount.addIdentityLayer(identity as Parameters<typeof fusionAccount.addIdentityLayer>[0])
        applied++
    }
    return { hydrated: distinctIds.size, applied }
}

async function applyFusionReset(serviceRegistry: ServiceRegistry): Promise<void> {
    const { forms, fusion, sources } = serviceRegistry
    await forms.deleteExistingForms()
    await fusion.disableReset()
    await fusion.resetState()
    await sources.resetBatchCumulativeCount()
}

export async function setupPhase(
    serviceRegistry: ServiceRegistry,
    schema: any,
    options: PhaseOptions
): Promise<boolean> {
    const { log, fusion, schemas, sources, definition, config } = serviceRegistry
    const { isPersistent, tracker } = options
    const forceAttributeRefresh = isPersistent && config.forceAttributeRefresh

    if (tracker) fusion.setTracker(tracker)
    fusion.setPersistentRun(isPersistent)

    await sources.fetchAllSources(isPersistent)
    log.info(`Loaded ${sources.managedSources.length} managed source(s)`)
    if (!sources.hasFusionSource) {
        throw new Error(
            'Fusion source not found. The connector instance could not locate its own source in ISC. Verify the connector is properly deployed.'
        )
    }

    if (isPersistent) await sources.setProcessLock()

    if (fusion.isReset()) {
        log.info('Reset flag detected, disabling reset and exiting')
        if (isPersistent) await applyFusionReset(serviceRegistry)
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
        const schemaAttrNames = await schemas.getManagedSourceSchemaAttributeNames()
        const reverseCorrelationCount = await sources.setupReverseCorrelationSources(schemaAttrNames)
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

    await definition.initializeCounters()
    log.info('Attribute counters initialized')
    return true
}

function countManagedAccountsByType(sources: ServiceRegistry['sources']) {
    let authoritative = 0,
        record = 0,
        orphan = 0
    for (const account of sources.run.managedAccountsById.values()) {
        const sourceType = sources.getSourceByNameSafe(account.sourceName)?.sourceType ?? SourceType.Authoritative
        if (sourceType === SourceType.Record) record++
        else if (sourceType === SourceType.Orphan) orphan++
        else authoritative++
    }
    return {
        managedAccountsFound: sources.run.managedAccountsById.size,
        managedAccountsFoundAuthoritative: authoritative,
        managedAccountsFoundRecord: record,
        managedAccountsFoundOrphan: orphan,
    }
}

export async function fetchPhase(serviceRegistry: ServiceRegistry, options: PhaseOptions): Promise<FetchResult> {
    const { log, identities, sources, forms, fusion, workflows } = serviceRegistry
    const { isPersistent } = options
    const ownerIncluded = isPersistent
        ? fusion.fusionReportOnAggregation || fusion.fusionOwnerIsGlobalReviewer
        : false

    log.info('Fetching identities, managed accounts, and dependencies')

    const ownerIdsPromise = ownerIncluded ? sources.fetchGlobalOwnerIdentityIds() : Promise.resolve([])

    const fetchTasks: Array<Promise<void>> = [
        ownerIdsPromise.then((ownerIds) => identities.fetchIdentities(ownerIds)),
        sources.fetchManagedAccounts(),
        sources.fetchFusionAccounts(),
        forms.fetchFormInstances(isPersistent),
    ]
    if (isPersistent && sources.delayedAggregationSources?.length) {
        fetchTasks.push(workflows.fetchDelayedAggregationSender())
    }

    const fetchAllOp = log.track('fetchPhase.parallelFetch')
    await Promise.all(fetchTasks)
    fetchAllOp.done({ taskCount: fetchTasks.length })

    log.info('Processing fetched form data')
    const processFormDataOp = log.track('fetchPhase.processFormData')
    await forms.processFetchedFormData()
    processFormDataOp.done()

    log.info('Hydrating correlated identities for managed accounts')
    const hydrationResult = await hydrateCorrelatedManagedAccountIdentities({
        managedAccounts: sources.run.managedAccountsById.values(),
        fusionAccounts: sources.run.allFusionAccounts,
        managedAccountsByKey: sources.run.managedAccountsById as Map<string, { identityId?: string }>,
        getIdentity: (id) => sources.run.getIdentity(id),
        hydrateMissingIdentitiesById: (ids) => identities.hydrateMissingIdentitiesById(ids),
    })
    log.info(
        `Hydrated ${hydrationResult.hydrated} correlated identity/identities; applied identity layer to ${hydrationResult.applied} fusion account(s)`
    )

    const counts = countManagedAccountsByType(sources)
    log.info(
        `Loaded ${sources.fusionAccountCount} fusion account(s), ${identities.identityCount} identities, ${counts.managedAccountsFound} managed account(s)`
    )
    return { ...counts, identitiesFound: identities.identityCount }
}

export async function refreshPhase(serviceRegistry: ServiceRegistry): Promise<void> {
    const { log, fusion, sources } = serviceRegistry
    log.info('Refreshing Fusion accounts')
    const refreshOp = log.track('refreshPhase.processFusionAccounts')
    const processedFusionAccounts = await fusion.processFusionAccounts()
    refreshOp.done({ count: processedFusionAccounts.length })
    log.info(`Refresh phase complete - ${sources.run.managedAccountsById.size} unprocessed account(s) remaining`)
}

export async function processPhase(serviceRegistry: ServiceRegistry, options: PhaseOptions): Promise<void> {
    const { log, fusion, identities, sources } = serviceRegistry
    const { isPersistent } = options

    log.stepStart('process-identities')
    const identitiesOp = log.track('FusionService.processIdentities')
    await fusion.processIdentities()
    identitiesOp.done({ count: identities.identityCount })
    log.stepEnd('process-identities', { count: identities.identityCount })

    log.stepStart('process-decisions')
    const decisionsOp = log.track('FusionService.processFusionIdentityDecisions')
    const decisions = await fusion.processFusionIdentityDecisions()
    decisionsOp.done({ count: decisions.length })
    log.stepEnd('process-decisions', { count: decisions.length })

    if (!sources.run.isRecordMode) {
        identities.clear()
        log.info('Identities cache cleared from memory')
    } else {
        log.info('Identities cache retained for recording')
    }

    await fusion.initializeManagedAccountProcessing()

    log.stepStart('correlated-sweep')
    await fusion.processCorrelatedManagedAccounts()
    log.stepEnd('correlated-sweep', { remaining: sources.run.managedAccountsById.size })

    log.stepStart('record-unique-registration')
    const recordUniqueOp = log.track('FusionService.processRecordUniqueRegistration')
    const { registered: recordUniqueRegistered } = await fusion.processRecordUniqueRegistration()
    recordUniqueOp.done({ registered: recordUniqueRegistered })
    log.stepEnd('record-unique-registration', { registered: recordUniqueRegistered })

    const uncorrelatedCount = sources.run.managedAccountsById.size
    log.stepStart('uncorrelated-sweep', { accounts: uncorrelatedCount })
    const managedAccountsOp = log.track('FusionService.processManagedAccounts')
    const { processed, matchScoringMs } = await fusion.processUncorrelatedManagedAccounts()
    managedAccountsOp.done({ analyzed: processed, matchScoringMs })
    log.stepEnd('uncorrelated-sweep', { analyzed: processed })

    if (sources.run.fullScanFallbackCount > 0) {
        log.warn(
            `Full identity scan fallback: ${sources.run.fullScanFallbackCount} account(s) — trigram blocking was ineffective`
        )
    }

    if (isPersistent) {
        log.stepStart('await-disable-ops', { pending: fusion.run.pendingDisableOperationsCount })
        await fusion.awaitPendingDisableOperations()
        log.stepEnd('await-disable-ops')
    }

    log.stepStart('form-reconcile')
    fusion.reconcilePendingFormState()
    log.stepEnd('form-reconcile', { remaining: sources.run.managedAccountsById.size })
    log.info(`Process phase complete - ${sources.run.managedAccountsById.size} unprocessed account(s) remaining`)
}

export async function outputPhase(serviceRegistry: ServiceRegistry, options: PhaseOptions): Promise<number> {
    const { log, fusion, forms, sources, definition, workflows, res } = serviceRegistry
    const { isPersistent } = options

    if (!sources.run.isRecordMode) {
        sources.clearManagedAccounts()
    } else {
        log.info('Managed accounts cache retained for recording')
    }

    if (!isPersistent) {
        if (!sources.run.isRecordMode) {
            sources.clearFusionAccounts()
        } else {
            log.info('Fusion accounts cache retained for recording')
        }
        log.info('Account caches cleared from memory')
        return 0
    }

    const formCleanupOp = log.track('outputPhase.formCleanup')
    log.stepStart('form-cleanup')
    await forms.cleanUpForms()
    formCleanupOp.done()
    log.stepEnd('form-cleanup')

    log.stepStart('send-accounts')
    const sendAccountsOp = log.track('outputPhase.sendAccounts')
    const { sent, eligible } = await fusion.forEachISCAccount(
        (account) => {
            res.send(account)
            if (options.streamProgress) options.streamProgress.sent++
        },
        isPersistent
    )
    sendAccountsOp.done({ sent, eligible })
    log.stepEnd('send-accounts', { sent, eligible })
    log.info(`Sent ${sent} account(s) to platform`)

    log.stepStart('save-state')
    const saveStateOp = log.track('outputPhase.savePersistentState')
    await definition.saveState()
    await sources.saveBatchCumulativeCount()
    saveStateOp.done()
    log.stepEnd('save-state')

    log.stepStart('schedule-aggregations')
    const scheduleAggregationOp = log.track('outputPhase.scheduleDelayedAggregations')
    await sources.aggregateDelayedSources((params) => workflows.scheduleDelayedAggregation(params))
    scheduleAggregationOp.done()
    log.stepEnd('schedule-aggregations')

    log.stepStart('await-form-deletes')
    await forms.awaitPendingDeleteOperations()
    log.stepEnd('await-form-deletes')
    log.info('Queued form deletions completed')
    return sent
}

export interface ReportEpilogueOptions {
    isPersistent: boolean
    dryRun?: DryRunInput
    fetchResult?: FetchResult
    outputCount?: number
    timer: ReturnType<ServiceRegistry['log']['timer']>
    runError?: unknown
}

export async function reportEpilogue(
    serviceRegistry: ServiceRegistry,
    options: ReportEpilogueOptions
): Promise<unknown | undefined> {
    const { log, reports, res, fusion } = serviceRegistry
    const { isPersistent, dryRun, fetchResult, outputCount, timer } = options
    let deferredError: unknown

    serviceRegistry.runContext.phase = 'Epilogue'
    log.info('EPILOGUE report START')

    if (isPersistent && fetchResult && fusion.fusionReportOnAggregation) {
        try {
            log.info('Generating aggregation report')
            const reportOp = log.track('reportPhase.generateReport')
            await generateReport(false, serviceRegistry, fetchResultToAggregationStats(fetchResult, timer))
            reportOp.done()
        } catch (error) {
            log.warn(`Report epilogue: aggregation report failed: ${(error as Error).message}`)
        }
    }

    if (dryRun && fetchResult) {
        if (dryRun.saveFile || dryRun.sendEmail) {
            try {
                const { report } = reports.initializeDryRunReport({
                    fetchResult,
                    totalProcessingTime: timer.totalElapsed(),
                    phaseTiming: timer.getPhaseBreakdown(),
                })
                const { reportHtmlOutputPath } = await reports.finalizeDryRunReport({
                    report,
                    fetchResult,
                    totalProcessingTime: timer.totalElapsed(),
                    phaseBreakdownThroughOutput: timer.getPhaseBreakdown(),
                    saveFile: dryRun.saveFile,
                    sendEmail: dryRun.sendEmail,
                })
                if (reportHtmlOutputPath) {
                    log.info(`Dry-run HTML report written to ${reportHtmlOutputPath}`)
                }
            } catch (error) {
                log.warn(`Report epilogue: dry-run report failed: ${(error as Error).message}`)
            }
        }

        try {
            const summary = buildTerminalSummary(serviceRegistry, { outputCount, fetchResult, timer }, dryRun)
            res.send(summary)
        } catch (error) {
            log.warn(`Report epilogue: terminal summary send failed: ${(error as Error).message}`)
            deferredError = error
        }
    }

    timer.phase('Epilogue: report generation', 'info', 'Report')
    return deferredError
}

/**
 * Self-contained setup + fetch + process for report triggers (e.g. reportAction).
 * Runs phases 1-4 non-persistently so that all fusion accounts, identities, and
 * managed accounts are in memory for report building.
 */
export async function buildReportContext(serviceRegistry: ServiceRegistry): Promise<{
    fetchResult: FetchResult
    timer: ReturnType<ServiceRegistry['log']['timer']>
}> {
    const { log } = serviceRegistry
    const timer = log.timer()
    const options: PhaseOptions = { isPersistent: false }

    const shouldContinue = await setupPhase(serviceRegistry, undefined, options)
    if (!shouldContinue) {
        return { fetchResult: createEmptyFetchResult(), timer }
    }
    timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

    const fetchResult = await fetchPhase(serviceRegistry, options)
    timer.phase('PHASE 2: Fetching data in parallel', 'info', 'Fetch')

    await refreshPhase(serviceRegistry)
    timer.phase('PHASE 3: Refresh (fusion accounts)', 'info', 'Refresh')

    await processPhase(serviceRegistry, options)
    timer.phase('PHASE 4: Process (identities, managed accounts, form reconciliation)', 'info', 'Process')

    return { fetchResult, timer }
}



