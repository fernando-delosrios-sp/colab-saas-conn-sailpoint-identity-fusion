import { ServiceRegistry } from '../../services/serviceRegistry'
import { PhaseTimer } from '../../services/logService'
import { formatFormOutcomesSegment, formatMatchOutcomesSegment } from '../../services/logService/operationHeartbeat'
import { formatCorrelationSummaryValue } from '../../services/logService/operationRunContext'
import { SourceType } from '../../model/config'
import { AggregationTracker } from '../../services/fusionService'
import { AggregationStats } from '../../services/fusionService/types'
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
    timer: ReturnType<ServiceRegistry['log']['timer']>,
    options?: { fusionAccountsReturned?: number }
): AggregationStats {
    return {
        identitiesFound: fetchResult.identitiesFound,
        managedAccountsFound: fetchResult.managedAccountsFound,
        managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
        managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
        fusionAccountsReturned: options?.fusionAccountsReturned,
        totalProcessingTime: timer.totalElapsed(),
        phaseTiming: timer.getPhaseBreakdown(),
    }
}

/**
 * Hydrates out-of-scope identities for correlated orphan managed accounts still on the
 * work queue after refresh. Enables {@link FusionAccount.identityAlias} on new Fusion
 * accounts created from those orphans during the correlated account sweep.
 */
export async function hydrateCorrelatedManagedAccountIdentities(deps: {
    managedAccounts: Iterable<{ identityId?: string; uncorrelated?: boolean }>
    hydrateMissingIdentitiesById: (ids: string[]) => Promise<void>
}): Promise<{ hydrated: number }> {
    const distinctIds = new Set<string>()
    for (const managed of deps.managedAccounts) {
        if (managed.uncorrelated !== false) continue
        const id = managed.identityId
        if (id) distinctIds.add(id)
    }
    if (distinctIds.size === 0) return { hydrated: 0 }

    await deps.hydrateMissingIdentitiesById(Array.from(distinctIds))
    return { hydrated: distinctIds.size }
}

async function applyFusionFormsReset(serviceRegistry: ServiceRegistry): Promise<void> {
    const { forms, fusion } = serviceRegistry
    await forms.deleteExistingForms()
    await fusion.disableResetForms()
}

async function applyFusionAccountReset(serviceRegistry: ServiceRegistry): Promise<void> {
    const { fusion, sources } = serviceRegistry
    await fusion.disableResetAccounts()
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

    await sources.fetchAllSources(isPersistent)
    log.detail({ sources: sources.managedSources.length })
    if (!sources.hasFusionSource) {
        throw new Error(
            'Fusion source not found. The connector instance could not locate its own source in ISC. Verify the connector is properly deployed.'
        )
    }

    if (isPersistent) await sources.setProcessLock()

    if (isPersistent && fusion.isResetForms()) {
        log.detail({ action: 'reset forms flag detected, deleting fusion review forms' })
        await applyFusionFormsReset(serviceRegistry)
    }

    if (fusion.isResetAccounts()) {
        log.detail({ action: 'reset accounts flag detected, clearing state and exiting' })
        if (isPersistent) await applyFusionAccountReset(serviceRegistry)
        return false
    }

    if (forceAttributeRefresh) {
        log.detail({ action: 'force attribute refresh flag detected, disabling flag for next run' })
        await fusion.disableForceAttributeRefresh()
    }

    if (schema) {
        await schemas.setFusionAccountSchema(schema)
    } else {
        await schemas.loadFusionAccountSchemaFromSource()
        log.detail({ action: 'input schema not provided; loaded fusion account schema from source' })
    }
    log.detail({ action: 'fusion account schema set successfully' })

    sources.clearReverseCorrelationReadinessCache()
    const reverseCorrelationOp = log.track('reverseCorrelationSetup')
    const schemaAttrNames = await schemas.getManagedSourceSchemaAttributeNames()
    const reverseCorrelationCount = await sources.setupReverseCorrelationSources(schemaAttrNames)
    if (reverseCorrelationCount > 0) {
        await schemas.setFusionAccountSchema(undefined)
        log.debug('Fusion account schema refreshed after reverse correlation setup')
        log.detail({ action: 'reverse correlation setup completed', sources: reverseCorrelationCount })
        reverseCorrelationOp.done({ sources: reverseCorrelationCount })
    }
    const aggregateManagedSourcesOp = log.track('aggregateManagedSources')
    await sources.aggregateManagedSources()
    log.detail({ action: 'managed sources aggregated' })
    aggregateManagedSourcesOp.done({ sources: sources.managedSources.length })

    await definition.initializeCounters()
    log.detail({ action: 'attribute counters initialized' })
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

    log.detail({ action: 'fetching identities, managed accounts, and dependencies' })

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

    log.detail({ action: 'processing fetched form data' })
    const processFormDataOp = log.track('fetchPhase.processFormData')
    await forms.processFetchedFormData()
    processFormDataOp.done()
    log.detail({
        'fusion-reviews': forms.formsFound,
        'fusion-review-instances': forms.formInstancesFound,
    })

    const counts = countManagedAccountsByType(sources)
    log.detail({
        'fusion-accounts': sources.fusionAccountCount,
        identities: identities.identityCount,
        'managed-accounts': counts.managedAccountsFound,
    })
    return { ...counts, identitiesFound: identities.identityCount }
}

export async function refreshPhase(serviceRegistry: ServiceRegistry): Promise<void> {
    const { log, fusion } = serviceRegistry
    log.detail({ action: 'refreshing fusion accounts' })
    const refreshOp = log.track('refreshPhase.processFusionAccounts')
    const processedFusionAccounts = await fusion.processFusionAccounts()
    refreshOp.done({ count: processedFusionAccounts.length })
    log.detail({ action: 'refresh phase complete' })
}

export async function processPhase(serviceRegistry: ServiceRegistry, _options: PhaseOptions): Promise<void> {
    const { log, fusion, identities, sources, forms } = serviceRegistry

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
        log.detail({ action: 'identities cache cleared from memory' })
    } else {
        log.detail({ cache: 'identities retained for recording' })
    }

    log.stepStart('managed-account-init')
    const initOp = log.track('FusionService.initializeManagedAccountProcessing')
    await fusion.initializeManagedAccountProcessing()
    initOp.done()
    log.stepEnd('managed-account-init', { remaining: sources.run.managedAccountsById.size })

    log.stepStart('orphan-identity-hydration')
    const hydrationResult = await hydrateCorrelatedManagedAccountIdentities({
        managedAccounts: sources.run.managedAccountsById.values(),
        hydrateMissingIdentitiesById: (ids) => identities.hydrateMissingIdentitiesById(ids),
    })
    log.detail({ hydrated: hydrationResult.hydrated, action: 'orphan correlated identities hydrated' })
    log.stepEnd('orphan-identity-hydration', { hydrated: hydrationResult.hydrated })

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
    managedAccountsOp.done({ analyzed: processed, matchScoring: PhaseTimer.formatElapsed(matchScoringMs) })
    log.stepEnd('uncorrelated-sweep', { analyzed: processed })

    if (sources.run.fullScanFallbackCount > 0) {
        log.warn(
            `Full identity scan fallback: ${sources.run.fullScanFallbackCount} account(s) — trigram blocking was ineffective`
        )
    }

    log.stepStart('await-disable-ops', { pending: fusion.run.pendingDisableOperationsCount })
    await fusion.awaitPendingDisableOperations()
    log.stepEnd('await-disable-ops')

    log.stepStart('form-reconcile')
    fusion.reconcilePendingFormState()
    log.stepEnd('form-reconcile', {
        'forms-created': forms.formsCreated,
        'instances-sent': forms.formInstancesCreated,
    })
    const matchOutcomes = formatMatchOutcomesSegment(log.getCumulativeOutcomes(), true)
    const formOutcomes = formatFormOutcomesSegment(forms.formsCreated, forms.formInstancesCreated)
    const phaseCorrelation = log.getRunContext()?.getPhaseCorrelationCounters()
    const correlationSegment = phaseCorrelation
        ? formatCorrelationSummaryValue(phaseCorrelation, { cumulative: true })
        : ''
    log.detail({
        action: 'process phase complete',
        matches: matchOutcomes,
        forms: formOutcomes,
        ...(correlationSegment ? { correlations: correlationSegment } : {}),
    })
}

export async function outputPhase(serviceRegistry: ServiceRegistry, options: PhaseOptions): Promise<number> {
    const { log, fusion, forms, sources, definition, workflows, res } = serviceRegistry
    const { isPersistent } = options

    if (!sources.run.isRecordMode) {
        const managedAccountCount = sources.run.managedAccountsById.size
        log.stepStart('clear-managed-accounts', { accounts: managedAccountCount })
        const clearOp = log.track('outputPhase.clearManagedAccounts')
        sources.clearManagedAccounts()
        clearOp.done()
        log.stepEnd('clear-managed-accounts', { cleared: managedAccountCount })
    } else {
        log.detail({ cache: 'managed accounts retained for recording' })
    }

    log.stepStart('send-accounts')
    const sendAccountsOp = log.track('outputPhase.sendAccounts')
    const { sent, eligible } = await fusion.forEachISCAccount(
        (account) => {
            res.send(account)
            if (options.streamProgress) options.streamProgress.sent++
        },
        true
    )
    sendAccountsOp.done({ sent, eligible })
    log.stepEnd('send-accounts', { sent, eligible })
    log.detail({ sent, action: 'accounts sent to platform' })

    if (!isPersistent) {
        return sent
    }

    const formCleanupOp = log.track('outputPhase.formCleanup')
    log.stepStart('form-cleanup')
    await forms.cleanUpForms()
    formCleanupOp.done()
    log.stepEnd('form-cleanup')

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
    log.detail({ action: 'queued form deletions completed' })
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

    log.epilogueStart('report')
    const epilogueStartedAt = log.getRunContext()?.epilogueStartedAt ?? Date.now()

    if (isPersistent && fetchResult && fusion.fusionReportOnAggregation) {
        try {
            log.detail({ action: 'generating aggregation report' })
            const reportOp = log.track('reportPhase.generateReport')
            await generateReport(
                false,
                serviceRegistry,
                fetchResultToAggregationStats(fetchResult, timer, { fusionAccountsReturned: outputCount })
            )
            reportOp.done()
        } catch (error) {
            log.warn(`Report epilogue: aggregation report failed: ${(error as Error).message}`)
        }
    }

    if (dryRun && fetchResult) {
        if (dryRun.saveFile || dryRun.sendEmail) {
            try {
                const reportPhaseStartedAt = Date.now()
                const { reportHtmlOutputPath } = await reports.generateDryRunReport({
                    aggregationStats: fetchResultToAggregationStats(fetchResult, timer, {
                        fusionAccountsReturned: outputCount,
                    }),
                    reportPhaseStartedAt,
                    saveFile: dryRun.saveFile,
                    sendEmail: dryRun.sendEmail,
                })
                if (reportHtmlOutputPath) {
                    log.detail({ action: 'dry-run HTML report written', path: reportHtmlOutputPath })
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

    timer.recordElapsed('Report', Date.now() - epilogueStartedAt)
    log.epilogueEnd('report')
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

    let phaseStarted = Date.now()
    const shouldContinue = await setupPhase(serviceRegistry, undefined, options)
    timer.recordElapsed('Setup', Date.now() - phaseStarted)
    if (!shouldContinue) {
        return { fetchResult: createEmptyFetchResult(), timer }
    }

    phaseStarted = Date.now()
    const fetchResult = await fetchPhase(serviceRegistry, options)
    timer.recordElapsed('Fetch', Date.now() - phaseStarted)

    phaseStarted = Date.now()
    await refreshPhase(serviceRegistry)
    timer.recordElapsed('Refresh', Date.now() - phaseStarted)

    phaseStarted = Date.now()
    await processPhase(serviceRegistry, options)
    timer.recordElapsed('Process', Date.now() - phaseStarted)

    return { fetchResult, timer }
}









