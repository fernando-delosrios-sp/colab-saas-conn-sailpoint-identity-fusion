import { StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { FusionAccount } from '../../model/account'
import {
    buildReportAccountIndex,
    CustomReportRowCounter,
    enrichISCAccountWithMatching,
    PendingReviewContextByAccountId,
} from './buildCustomReportPayload'

export interface FetchResult {
    identitiesFound: number
    managedAccountsFound: number
    managedAccountsFoundAuthoritative: number
    managedAccountsFoundRecord: number
    managedAccountsFoundOrphan: number
}

export type SafeSender = {
    send: (payload: any) => void
    drain: () => Promise<void>
}

export type CustomReportRuntimeOptions = {
    limit?: number
    summary: boolean
    onlyMatching: boolean
    onlyReview: boolean
}

/**
 * The SDK's spcx dev server uses `stream.pipeline(out, res)` where `out` is a
 * Transform that `res.send()` writes into. The pipeline drains `out` into the
 * HTTP response asynchronously. If the handler returns before the pipeline
 * finishes draining, the SDK calls `res.end()` and the pipeline fires
 * `ERR_STREAM_PREMATURE_CLOSE`. `drain()` yields to the event loop in a loop
 * until the Transform's internal buffers are empty, so the pipeline can finish
 * before the handler returns.
 */
export const createSafeSender = (serviceRegistry: ServiceRegistry): SafeSender => {
    const { res } = serviceRegistry
    const transform = (res as any)._writable as import('stream').Transform | undefined

    return {
        send: (payload: any): void => {
            res.send(payload)
        },
        drain: async (): Promise<void> => {
            if (!transform || typeof transform.readableLength !== 'number') return
            while (transform.readableLength > 0 || transform.writableLength > 0) {
                await new Promise((resolve) => setImmediate(resolve))
            }
        },
    }
}

export const buildStatsForCustomReport = (
    fetchResult: FetchResult,
    issueSummary: {
        warningCount: number
        errorCount: number
        warningSamples: string[]
        errorSamples: string[]
    },
    totalProcessingTime: string
) => {
    const memoryUsage = process.memoryUsage()
    return {
        identitiesFound: fetchResult.identitiesFound,
        managedAccountsFound: fetchResult.managedAccountsFound,
        managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
        managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
        totalProcessingTime,
        aggregationWarnings: issueSummary.warningCount,
        aggregationErrors: issueSummary.errorCount,
        warningSamples: issueSummary.warningSamples,
        errorSamples: issueSummary.errorSamples,
        usedMemory: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    }
}

export const streamEnrichedOutputRows = async (
    serviceRegistry: ServiceRegistry,
    reportIndex: ReturnType<typeof buildReportAccountIndex>,
    pendingReviewByAccountId: PendingReviewContextByAccountId,
    rowCounter: CustomReportRowCounter,
    sender: SafeSender,
    runtimeOptions: CustomReportRuntimeOptions
): Promise<number> => {
    const { fusion } = serviceRegistry
    let emittedRows = 0

    await fusion.forEachISCAccount((account) => {
        const enriched = enrichISCAccountWithMatching(account, reportIndex, pendingReviewByAccountId)
        if (!shouldEmitRow(enriched.account, enriched.status, runtimeOptions, emittedRows)) {
            return
        }
        rowCounter[enriched.status] += 1
        sender.send(enriched.account)
        emittedRows += 1
    })

    return emittedRows
}


export const streamFallbackAnalyzedRows = async (
    serviceRegistry: ServiceRegistry,
    analyzedManagedAccounts: FusionAccount[],
    reportIndex: ReturnType<typeof buildReportAccountIndex>,
    pendingReviewByAccountId: PendingReviewContextByAccountId,
    rowCounter: CustomReportRowCounter,
    sender: SafeSender,
    sentRows: number,
    runtimeOptions: CustomReportRuntimeOptions
): Promise<number> => {
    const { log, fusion } = serviceRegistry

    let totalSentRows = sentRows
    if (hasReachedLimit(runtimeOptions.limit, totalSentRows)) {
        return totalSentRows
    }
    for (const analyzedAccount of analyzedManagedAccounts) {
        if (hasReachedLimit(runtimeOptions.limit, totalSentRows)) {
            break
        }
        const output = await fusion.getISCAccount(analyzedAccount, false)
        if (!output) continue

        const enriched = enrichISCAccountWithMatching(output, reportIndex, pendingReviewByAccountId)
        if (!shouldEmitRow(enriched.account, enriched.status, runtimeOptions, totalSentRows)) {
            continue
        }
        rowCounter[enriched.status] += 1
        sender.send(enriched.account)
        totalSentRows += 1
    }

    log.info(`Fallback streaming emitted ${totalSentRows} analyzed managed account row(s)`)
    return totalSentRows
}

const hasReachedLimit = (limit: number | undefined, emittedRows: number): boolean =>
    typeof limit === 'number' && emittedRows >= limit

const shouldEmitRow = (
    enrichedAccount: any,
    status: keyof CustomReportRowCounter,
    runtimeOptions: CustomReportRuntimeOptions,
    emittedRows: number
): boolean => {
    if (hasReachedLimit(runtimeOptions.limit, emittedRows)) {
        return false
    }
    const isMatched = status === 'matched'
    const reviewPending = Boolean(enrichedAccount?.attributes?.review?.pending)

    if (runtimeOptions.onlyMatching && runtimeOptions.onlyReview) {
        return isMatched || reviewPending
    }
    if (runtimeOptions.onlyMatching && !isMatched) {
        return false
    }
    if (runtimeOptions.onlyReview && !reviewPending) {
        return false
    }
    return true
}

export const refreshUniqueAttributesForCustomReport = async (
    serviceRegistry: ServiceRegistry,
    analyzedManagedAccounts: FusionAccount[]
): Promise<void> => {
    const { fusion, attributes, log } = serviceRegistry

    // Refresh unique attributes for accounts already tracked in fusion maps.
    await fusion.refreshUniqueAttributes()

    // Also refresh analyzed managed accounts that may only exist in fallback mode.
    if (analyzedManagedAccounts.length === 0) return
    const batchSize = serviceRegistry.config?.managedAccountsBatchSize ?? 50
    for (let i = 0; i < analyzedManagedAccounts.length; i += batchSize) {
        const batch = analyzedManagedAccounts.slice(i, i + batchSize)
        await Promise.all(batch.map((account) => attributes.refreshUniqueAttributes(account)))
    }

    log.info(`Unique attributes refreshed for ${analyzedManagedAccounts.length} analyzed managed account(s)`)
}

export async function fetchPhase(
    serviceRegistry: ServiceRegistry,
    inputSchema: StdAccountListInput['schema']
): Promise<FetchResult> {
    const { log, identities, sources, schemas } = serviceRegistry
    await sources.fetchAllSources(false)
    log.info(`Loaded ${sources.managedSources.length} managed source(s)`)

    if (inputSchema) {
        await schemas.setFusionAccountSchema(inputSchema)
    } else {
        const dynamicSchema = await schemas.buildDynamicSchema()
        await schemas.setFusionAccountSchema(dynamicSchema)
        log.info('Input schema not provided; using dynamically built fusion account schema for custom:report')
    }

    const fetchTasks: Array<Promise<void>> = [identities.fetchIdentities(), sources.fetchManagedAccounts()]
    if (sources.hasFusionSource) {
        fetchTasks.push(sources.fetchFusionAccounts())
    } else {
        log.info('Fusion source not found; custom:report will run without existing fusion accounts')
    }
    await Promise.all(fetchTasks)

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
