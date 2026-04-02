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
    /** Emit rows in the `baseline` report category (`statuses` includes `baseline`), not every pre-existing fusion account. */
    includeExisting: boolean
    includeUnmatched: boolean
    includeMatched: boolean
    includeDeferred: boolean
    includeReview: boolean
    includeDecisions: boolean
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
    decisionAccountIds: Set<string>,
    emittedRowKeys: Set<string>,
    rowCounter: CustomReportRowCounter,
    sender: SafeSender,
    runtimeOptions: CustomReportRuntimeOptions
): Promise<number> => {
    const { fusion } = serviceRegistry
    const enrichedRows: Array<{ account: any; status: keyof CustomReportRowCounter }> = []

    await fusion.forEachISCAccount((account) => {
        const enriched = enrichISCAccountWithMatching(account, reportIndex, pendingReviewByAccountId)
        enrichedRows.push(enriched)
    })

    return emitGroupedRows(enrichedRows, decisionAccountIds, emittedRowKeys, rowCounter, sender, runtimeOptions)
}


export const streamFallbackAnalyzedRows = async (
    serviceRegistry: ServiceRegistry,
    analyzedManagedAccounts: FusionAccount[],
    reportIndex: ReturnType<typeof buildReportAccountIndex>,
    pendingReviewByAccountId: PendingReviewContextByAccountId,
    decisionAccountIds: Set<string>,
    emittedRowKeys: Set<string>,
    rowCounter: CustomReportRowCounter,
    sender: SafeSender,
    sentRows: number,
    runtimeOptions: CustomReportRuntimeOptions
): Promise<number> => {
    const { log, fusion } = serviceRegistry

    const enrichedRows: Array<{ account: any; status: keyof CustomReportRowCounter }> = []
    for (const analyzedAccount of analyzedManagedAccounts) {
        const output = await fusion.getISCAccount(analyzedAccount, false)
        if (!output) continue

        const enriched = enrichISCAccountWithMatching(output, reportIndex, pendingReviewByAccountId)
        enrichedRows.push(enriched)
    }

    const emittedRows = emitGroupedRows(enrichedRows, decisionAccountIds, emittedRowKeys, rowCounter, sender, runtimeOptions)
    const totalSentRows = sentRows + emittedRows
    log.info(`Fallback streaming emitted ${totalSentRows} analyzed managed account row(s)`)
    return totalSentRows
}

const CATEGORY_ORDER = ['baseline', 'unmatched', 'matched', 'deferred', 'review', 'decisions'] as const
type ReportCategory = (typeof CATEGORY_ORDER)[number]

const categorizeRow = (
    enrichedAccount: any,
    status: keyof CustomReportRowCounter,
    decisionAccountIds: Set<string>
): ReportCategory[] => {
    const categories: ReportCategory[] = []
    const statuses = new Set<string>(Array.isArray(enrichedAccount?.attributes?.statuses) ? enrichedAccount.attributes.statuses : [])
    const relatedAccounts = Array.isArray(enrichedAccount?.attributes?.accounts) ? enrichedAccount.attributes.accounts : []

    if (statuses.has('baseline')) categories.push('baseline')
    // "Unmatched" should include analysis-level non-matches plus explicit unmatched status tags.
    if (statuses.has('unmatched') || status === 'non-matched') categories.push('unmatched')
    if (status === 'matched') categories.push('matched')
    if (status === 'deferred') categories.push('deferred')

    const reviewPending = Boolean(enrichedAccount?.attributes?.review?.pending)
    if (reviewPending) categories.push('review')

    if (relatedAccounts.some((accountId: string) => decisionAccountIds.has(accountId))) {
        categories.push('decisions')
    }

    return categories
}

const emitGroupedRows = (
    enrichedRows: Array<{ account: any; status: keyof CustomReportRowCounter }>,
    decisionAccountIds: Set<string>,
    emittedKeys: Set<string>,
    rowCounter: CustomReportRowCounter,
    sender: SafeSender,
    runtimeOptions: CustomReportRuntimeOptions
): number => {
    const selectedCategories = new Set<ReportCategory>()
    if (runtimeOptions.includeExisting) selectedCategories.add('baseline')
    if (runtimeOptions.includeUnmatched) selectedCategories.add('unmatched')
    if (runtimeOptions.includeMatched) selectedCategories.add('matched')
    if (runtimeOptions.includeDeferred) selectedCategories.add('deferred')
    if (runtimeOptions.includeReview) selectedCategories.add('review')
    if (runtimeOptions.includeDecisions) selectedCategories.add('decisions')

    if (selectedCategories.size === 0) {
        return 0
    }

    const groupedRows = new Map<ReportCategory, Array<{ account: any; status: keyof CustomReportRowCounter; categories: ReportCategory[] }>>()
    for (const category of CATEGORY_ORDER) groupedRows.set(category, [])
    for (const enriched of enrichedRows) {
        const rowCategories = categorizeRow(enriched.account, enriched.status, decisionAccountIds).filter((category) =>
            selectedCategories.has(category)
        )
        if (rowCategories.length === 0) continue

        const firstCategory = rowCategories[0]
        const key = getEmissionKey(enriched.account)
        if (emittedKeys.has(key)) continue

        groupedRows.get(firstCategory)?.push({ ...enriched, categories: rowCategories })
        emittedKeys.add(key)
    }

    let emittedRows = 0
    for (const category of CATEGORY_ORDER) {
        const rows = groupedRows.get(category) ?? []
        for (const row of rows) {
            rowCounter[row.status] += 1
            const attributes = { ...(row.account.attributes ?? {}) }
            const { matching, review, ...cleanAttributes } = attributes

            const includeReview = row.categories.includes('review') || row.categories.includes('decisions')
            const { sourceContext: sourceStatus, correlationContext: correlationStatus, ...matchingStatus } = matching ?? {}
            sender.send({
                reportCategories: row.categories,
                matchingStatus,
                sourceStatus,
                correlationStatus,
                ...(includeReview ? { review } : {}),
                account: {
                    key: row.account.key,
                    attributes: cleanAttributes,
                    disabled: row.account.disabled,
                },
            })
            emittedRows += 1
        }
    }

    return emittedRows
}

const getEmissionKey = (account: any): string => {
    const keySimple = account?.key?.simple?.id
    if (keySimple) return String(keySimple)
    if (account?.key) return String(account.key)
    if (account?.attributes?.id) return String(account.attributes.id)
    if (account?.attributes?.originAccount) return String(account.attributes.originAccount)
    return JSON.stringify(account?.attributes?.accounts ?? [])
}

export const refreshUniqueAttributesForCustomReport = async (
    serviceRegistry: ServiceRegistry,
    analyzedManagedAccounts: FusionAccount[],
    runtimeOptions: CustomReportRuntimeOptions
): Promise<void> => {
    const { fusion, attributes, log } = serviceRegistry

    // Refresh unique attributes only for the account types we may emit.
    // Otherwise, incremental counter-based IDs can be consumed by rows that are never sent
    // (e.g. identity-origin fusion accounts when includeExisting=false), making report-only runs appear to "skip" numbers.
    //
    // Note: some unit-test mocks provide fusion.refreshUniqueAttributes() but not fusionAccounts/fusionIdentities getters.
    // Fall back to the legacy call in that case to keep tests and mocks stable.
    const batchSize = serviceRegistry.config?.managedAccountsBatchSize ?? 50
    const fusionAccounts = (fusion as any).fusionAccounts as FusionAccount[] | undefined
    const fusionIdentities = (fusion as any).fusionIdentities as Iterable<FusionAccount> | undefined
    if (Array.isArray(fusionAccounts) && fusionIdentities && Symbol.iterator in Object(fusionIdentities)) {
        const shouldIncludeIdentities = runtimeOptions.includeExisting
        const refreshTargets = shouldIncludeIdentities ? [...fusionAccounts, ...fusionIdentities] : [...fusionAccounts]
        for (let i = 0; i < refreshTargets.length; i += batchSize) {
            const batch = refreshTargets.slice(i, i + batchSize)
            await Promise.all(batch.map((account) => attributes.refreshUniqueAttributes(account)))
        }
    } else {
        await fusion.refreshUniqueAttributes()
    }

    // Also refresh analyzed managed accounts that may only exist in fallback mode.
    if (analyzedManagedAccounts.length === 0) return
    const stableAnalyzed = [...analyzedManagedAccounts].sort((a: any, b: any) => {
        const aKey = String(a?.originAccountId ?? a?.attributes?.originAccount ?? a?.nativeIdentity ?? a?.key ?? a?.name ?? '')
        const bKey = String(b?.originAccountId ?? b?.attributes?.originAccount ?? b?.nativeIdentity ?? b?.key ?? b?.name ?? '')
        return aKey.localeCompare(bKey)
    })
    for (let i = 0; i < stableAnalyzed.length; i += batchSize) {
        const batch = stableAnalyzed.slice(i, i + batchSize)
        await Promise.all(batch.map((account) => attributes.refreshUniqueAttributes(account)))
    }

    log.info(`Unique attributes refreshed for ${analyzedManagedAccounts.length} analyzed managed account(s)`)
}

export async function fetchPhase(
    serviceRegistry: ServiceRegistry,
    inputSchema: StdAccountListInput['schema']
): Promise<FetchResult> {
    const { log, identities, sources, schemas, attributes } = serviceRegistry
    await sources.fetchAllSources(false)
    log.info(`Loaded ${sources.managedSources.length} managed source(s)`)

    if (inputSchema) {
        await schemas.setFusionAccountSchema(inputSchema)
    } else {
        const dynamicSchema = await schemas.buildDynamicSchema()
        await schemas.setFusionAccountSchema(dynamicSchema)
        log.info('Input schema not provided; using dynamically built fusion account schema for custom:report')
    }

    // Match std:account:list behavior: ensure incremental counters used by unique
    // attribute definitions are initialized before any unique-attribute refresh.
    await attributes.initializeCounters()
    log.info('Attribute counters initialized')

    const fetchTasks: Array<Promise<void>> = [identities.fetchIdentities(), sources.fetchManagedAccounts()]
    if (sources.hasFusionSource) {
        fetchTasks.push(sources.fetchFusionAccounts())
    } else {
        log.info('Fusion source not found; custom:report will run without existing fusion accounts')
    }
    await Promise.all(fetchTasks)

    // Ensure counter-based unique attributes start after the max already assigned in the Fusion source.
    // Without this, custom:report can "burn" early counter values on collisions when state is missing/out of date.
    const { hasFusionSource, fusionAccounts } = sources
    if (
        hasFusionSource &&
        Array.isArray(fusionAccounts) &&
        fusionAccounts.length > 0 &&
        typeof attributes.seedIncrementalCountersFromRawAccounts === 'function'
    ) {
        await attributes.seedIncrementalCountersFromRawAccounts(fusionAccounts)
    }

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
