import { createWriteStream, type WriteStream } from 'fs'
import { mkdir, readFile, unlink } from 'fs/promises'
import * as path from 'path'
import { finished } from 'stream/promises'
import { StdAccountListOutput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { FusionReportAccount } from '../../services/fusionService/types'
import { isExactAttributeMatchScores } from '../../services/scoringService/exactMatch'
import { FusionAccount } from '../../model/account'
import {
    buildReportAccountIndex,
    DryRunInputOptions,
    DryRunOptionEmitCounter,
    DryRunSummary,
    enrichISCAccountWithMatching,
    MatchingStatus,
    PendingReviewContextByAccountId,
} from './buildDryRunPayload'

/** Record managed source account ids present on a streamed fusion ISC row (drives report join coverage). */
export const addCoveredManagedAccountIds = (account: StdAccountListOutput, into: Set<string>): void => {
    const raw = account.attributes?.accounts
    if (Array.isArray(raw)) {
        for (const x of raw) into.add(String(x))
    } else if (raw !== undefined && raw !== null) {
        into.add(String(raw))
    }
}

function buildOrphanDeferredStubOutput(accountId: string): StdAccountListOutput {
    return {
        key: { simple: { id: `orphan-deferred:${accountId}` } },
        disabled: false,
        attributes: {
            accounts: [accountId],
            statuses: [],
            reviews: [],
        },
    }
}

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

export type DryRunRuntimeOptions = DryRunInputOptions

export type DryRunRowEmitter = {
    emitRow: (payload: Record<string, unknown>) => Promise<void>
    /**
     * Non-disk: drains the HTTP sender. Disk: finalizes the JSON file; pass `summary` once built (after all rows).
     */
    close: (summary?: DryRunSummary | null) => Promise<void>
    /** Absolute path when `writeToDisk` is enabled; otherwise undefined. */
    diskOutputPath: string | undefined
}

const REPORT_DISK_SUBDIR = 'reports'

/** Yield to the pipeline after this many NDJSON rows (spcx `pipeline(out, res)` backpressure). */
const DRAIN_EVERY_N_ROWS = 20

/** Short host segment for filenames: first DNS label of the baseurl host, or full IP literal (sanitized). */
export const hostnameSegmentFromBaseurl = (baseurl: string | undefined): string => {
    if (!baseurl || typeof baseurl !== 'string' || !baseurl.trim()) {
        return 'unknown-host'
    }
    try {
        let host = new URL(baseurl.trim()).hostname
        if (host.startsWith('[') && host.endsWith(']')) {
            host = host.slice(1, -1)
        }
        let segment: string
        if (host.includes(':')) {
            segment = host.replace(/[^a-fA-F0-9:._-]+/g, '_').replace(/:/g, '_')
        } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
            segment = host.replace(/\./g, '_')
        } else {
            const dot = host.indexOf('.')
            segment = dot === -1 ? host : host.slice(0, dot)
        }
        const safe = segment.replace(/[^a-zA-Z0-9._-]+/g, '_')
        return safe.length > 0 ? safe : 'unknown-host'
    } catch {
        return 'unknown-host'
    }
}

function writeChunk(stream: WriteStream, chunk: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const ok = stream.write(chunk, (err) => {
            if (err) reject(err)
        })
        if (ok) resolve()
        else stream.once('drain', resolve)
    })
}

async function writePrettyJsonArrayElement(stream: WriteStream, obj: unknown, isFirst: number): Promise<void> {
    const prefix = isFirst === 0 ? '' : ',\n'
    const body = JSON.stringify(obj, null, 2)
    const indented = body
        .split('\n')
        .map((line) => '    ' + line)
        .join('\n')
    await writeChunk(stream, prefix + indented)
}

/**
 * Routes detail rows either through `res.send` (streaming) or to a pretty-printed JSON file under `./reports`
 * shaped as `{ "summary": {...}, "rows": [...] }` (summary first so consumers can read metadata without scanning rows).
 */
export const createDryRunRowEmitter = async (
    serviceRegistry: ServiceRegistry,
    sender: SafeSender,
    runtimeOptions: DryRunRuntimeOptions
): Promise<DryRunRowEmitter> => {
    const { log } = serviceRegistry

    if (!runtimeOptions.writeToDisk) {
        let rowCount = 0
        return {
            diskOutputPath: undefined,
            emitRow: async (payload: Record<string, unknown>) => {
                sender.send(payload)
                rowCount += 1
                if (rowCount % DRAIN_EVERY_N_ROWS === 0) {
                    await sender.drain()
                }
            },
            close: async () => {
                await sender.drain()
            },
        }
    }

    const cwd = process.cwd()
    const dir = path.join(cwd, REPORT_DISK_SUBDIR)
    await mkdir(dir, { recursive: true })
    const hostSeg = hostnameSegmentFromBaseurl(serviceRegistry.config?.baseurl)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `custom-report-${hostSeg}-${stamp}.json`
    const diskOutputPath = path.join(dir, fileName)
    const rowsTempPath = `${diskOutputPath}.rows.tmp`
    const rowsStream = createWriteStream(rowsTempPath, { flags: 'w' })
    let arrayElementCount = 0

    log.info(`custom:report writing detail rows to ${diskOutputPath} (rows buffer: ${rowsTempPath})`)

    return {
        diskOutputPath,
        emitRow: async (payload: Record<string, unknown>) => {
            await writePrettyJsonArrayElement(rowsStream, payload, arrayElementCount)
            arrayElementCount += 1
        },
        close: async (diskSummary?: DryRunSummary | null) => {
            rowsStream.end()
            await finished(rowsStream)
            try {
                const summaryJson = JSON.stringify(diskSummary ?? null, null, 2)
                const indentedSummary = summaryJson.split('\n').map((line) => '  ' + line).join('\n')
                const out = createWriteStream(diskOutputPath, { flags: 'w' })
                await writeChunk(out, '{\n  "summary": ' + indentedSummary + ',\n  "rows": [\n')
                const body = await readFile(rowsTempPath, 'utf8')
                if (body.length > 0) {
                    await writeChunk(out, body)
                }
                await writeChunk(out, '\n  ]\n}\n')
                out.end()
                await finished(out)
            } finally {
                try {
                    await unlink(rowsTempPath)
                } catch {
                    /* best-effort cleanup */
                }
            }
        },
    }
}

/**
 * The SDK's spcx dev server uses `stream.pipeline(out, res)` where `out` is the
 * Transform `ResponseStream._writable`. Many synchronous `send()` calls fill
 * that Transform faster than the pipeline writes to the HTTP response. The
 * server then ends `res` while data is still in flight → `ERR_STREAM_PREMATURE_CLOSE`.
 *
 * `drain()` waits until buffer lengths stay at zero across several event-loop
 * turns so `pipeline(out, res)` can catch up. Callers should also `await drain()`
 * periodically while streaming, not only once at the end.
 */
export const createSafeSender = (serviceRegistry: ServiceRegistry): SafeSender => {
    const { res } = serviceRegistry
    const transform = (res as { _writable?: import('stream').Transform })._writable

    return {
        send: (payload: any): void => {
            res.send(payload)
        },
        drain: async (): Promise<void> => {
            const w = transform
            if (!w || typeof w.readableLength !== 'number') return

            const maxIterations = 100_000
            for (let i = 0; i < maxIterations; i++) {
                while (w.readableLength > 0 || w.writableLength > 0) {
                    await new Promise<void>((resolve) => setImmediate(resolve))
                }
                await new Promise<void>((resolve) => setImmediate(resolve))
                await new Promise<void>((resolve) => setImmediate(resolve))
                if (w.readableLength === 0 && w.writableLength === 0) {
                    return
                }
            }
        },
    }
}

export const buildStatsForDryRun = (
    fetchResult: FetchResult,
    issueSummary: {
        warningCount: number
        errorCount: number
        warningSamples: string[]
        errorSamples: string[]
    },
    totalProcessingTime: string,
    fusionCounts?: { fusionAccountsFound: number; totalFusionAccounts: number }
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
        ...(fusionCounts
            ? { fusionAccountsFound: fusionCounts.fusionAccountsFound, totalFusionAccounts: fusionCounts.totalFusionAccounts }
            : {}),
    }
}

export const streamEnrichedOutputRows = async (
    serviceRegistry: ServiceRegistry,
    reportIndex: ReturnType<typeof buildReportAccountIndex>,
    pendingReviewByAccountId: PendingReviewContextByAccountId,
    decisionAccountIds: Set<string>,
    coveredManagedAccountIds: Set<string>,
    emittedRowKeys: Set<string>,
    optionEmitCounter: DryRunOptionEmitCounter,
    rowEmitter: DryRunRowEmitter,
    runtimeOptions: DryRunRuntimeOptions
): Promise<number> => {
    const { fusion } = serviceRegistry
    const enrichedRows: Array<{ account: any; status: MatchingStatus }> = []

    await fusion.forEachISCAccount((account) => {
        addCoveredManagedAccountIds(account, coveredManagedAccountIds)
        const enriched = enrichISCAccountWithMatching(
            account,
            reportIndex,
            pendingReviewByAccountId,
            serviceRegistry.config?.baseurl
        )
        enrichedRows.push(enriched)
    })

    const fusionIdentityAttribute = serviceRegistry.schemas.fusionIdentityAttribute ?? 'id'

    return await emitGroupedRows(
        enrichedRows,
        decisionAccountIds,
        emittedRowKeys,
        optionEmitCounter,
        rowEmitter.emitRow,
        runtimeOptions,
        fusionIdentityAttribute,
        true
    )
}


export const streamFallbackAnalyzedRows = async (
    serviceRegistry: ServiceRegistry,
    analyzedManagedAccounts: FusionAccount[],
    reportIndex: ReturnType<typeof buildReportAccountIndex>,
    pendingReviewByAccountId: PendingReviewContextByAccountId,
    decisionAccountIds: Set<string>,
    coveredManagedAccountIds: Set<string>,
    emittedRowKeys: Set<string>,
    optionEmitCounter: DryRunOptionEmitCounter,
    rowEmitter: DryRunRowEmitter,
    sentRows: number,
    runtimeOptions: DryRunRuntimeOptions
): Promise<number> => {
    const { log, fusion } = serviceRegistry

    const enrichedRows: Array<{ account: any; status: MatchingStatus }> = []
    for (const analyzedAccount of analyzedManagedAccounts) {
        const output = await fusion.getISCAccount(analyzedAccount, false)
        if (!output) continue

        addCoveredManagedAccountIds(output, coveredManagedAccountIds)
        const enriched = enrichISCAccountWithMatching(
            output,
            reportIndex,
            pendingReviewByAccountId,
            serviceRegistry.config?.baseurl
        )
        enrichedRows.push(enriched)
    }

    const fusionIdentityAttribute = serviceRegistry.schemas.fusionIdentityAttribute ?? 'id'

    const emittedRows = await emitGroupedRows(
        enrichedRows,
        decisionAccountIds,
        emittedRowKeys,
        optionEmitCounter,
        rowEmitter.emitRow,
        runtimeOptions,
        fusionIdentityAttribute,
        false
    )
    const totalSentRows = sentRows + emittedRows
    log.info(`Fallback streaming emitted ${totalSentRows} analyzed managed account row(s)`)
    return totalSentRows
}

/**
 * Deferred same-aggregation matches do not create a fusion account in the run, so the managed
 * account id never appears on any `forEachISCAccount` row. Emit synthetic ISC-shaped stubs so
 * `enrichISCAccountWithMatching` can attach the deferred FusionReportAccount slice.
 */
export const streamOrphanDeferredReportRows = async (
    serviceRegistry: ServiceRegistry,
    reportAccounts: FusionReportAccount[],
    reportIndex: ReturnType<typeof buildReportAccountIndex>,
    pendingReviewByAccountId: PendingReviewContextByAccountId,
    decisionAccountIds: Set<string>,
    coveredManagedAccountIds: Set<string>,
    emittedRowKeys: Set<string>,
    optionEmitCounter: DryRunOptionEmitCounter,
    rowEmitter: DryRunRowEmitter,
    runtimeOptions: DryRunRuntimeOptions
): Promise<number> => {
    const stubs: StdAccountListOutput[] = []
    for (const ra of reportAccounts) {
        if (!ra.deferred || !ra.accountId || ra.matches.length === 0) continue
        if (coveredManagedAccountIds.has(ra.accountId)) continue
        stubs.push(buildOrphanDeferredStubOutput(ra.accountId))
    }
    if (stubs.length === 0) {
        return 0
    }

    const enrichedRows = stubs.map((stub) =>
        enrichISCAccountWithMatching(stub, reportIndex, pendingReviewByAccountId, serviceRegistry.config?.baseurl)
    )
    const fusionIdentityAttribute = serviceRegistry.schemas.fusionIdentityAttribute ?? 'id'

    return await emitGroupedRows(
        enrichedRows,
        decisionAccountIds,
        emittedRowKeys,
        optionEmitCounter,
        rowEmitter.emitRow,
        runtimeOptions,
        fusionIdentityAttribute,
        false
    )
}

const CATEGORY_ORDER = [
    'baseline',
    'identity-linked',
    'nonMatched',
    'matched',
    'exact',
    'deferred',
    'review',
    'decisions',
    /** Every row from the fusion `forEachISCAccount` listing (any origin: identity, managed, uncorrelated). */
    'existing-fusion',
] as const
type ReportCategory = (typeof CATEGORY_ORDER)[number]

/** Non-empty value for the fusion schema identity attribute (e.g. correlated ISC identity id). */
const fusionIdentityAttributeValue = (attributes: any, attributeName: string): string => {
    if (!attributes || typeof attributes !== 'object') return ''
    const v = attributes[attributeName]
    if (v === undefined || v === null) return ''
    if (Array.isArray(v)) return String(v[0] ?? '').trim()
    return String(v).trim()
}

const categorizeRow = (
    enrichedAccount: any,
    status: MatchingStatus,
    decisionAccountIds: Set<string>,
    fusionIdentityAttribute: string
): ReportCategory[] => {
    const categories: ReportCategory[] = []
    const statuses = new Set<string>(Array.isArray(enrichedAccount?.attributes?.statuses) ? enrichedAccount.attributes.statuses : [])
    const relatedAccounts = Array.isArray(enrichedAccount?.attributes?.accounts) ? enrichedAccount.attributes.accounts : []

    if (statuses.has('baseline')) {
        categories.push('baseline')
    } else if (fusionIdentityAttributeValue(enrichedAccount?.attributes, fusionIdentityAttribute)) {
        // Correlated fusion accounts usually do not retain the "baseline" entitlement unless they were
        // created from the identity path; they still tie to an identity via the schema identity attribute.
        categories.push('identity-linked')
    }
    // NonMatched should include analysis-level non-matches plus explicit NonMatched status tags.
    if (statuses.has('nonMatched') || status === 'non-matched') categories.push('nonMatched')
    if (status === 'matched') {
        categories.push('matched')
        const matches = Array.isArray(enrichedAccount?.attributes?.matching?.matches)
            ? enrichedAccount.attributes.matching.matches
            : []
        if (matches.some((m: { scores?: Parameters<typeof isExactAttributeMatchScores>[0] }) => isExactAttributeMatchScores(m.scores))) {
            categories.push('exact')
        }
    }
    if (status === 'deferred') categories.push('deferred')

    const reviewPending = Boolean(enrichedAccount?.attributes?.review?.pending)
    if (reviewPending) categories.push('review')

    if (relatedAccounts.some((accountId: string) => decisionAccountIds.has(accountId))) {
        categories.push('decisions')
    }

    return categories
}

function bumpOptionEmitCountsForRow(
    categories: ReportCategory[],
    status: MatchingStatus,
    optionEmitCounter: DryRunOptionEmitCounter
): void {
    for (const c of categories) {
        if (c === 'nonMatched') optionEmitCounter.includeNonMatched += 1
        else if (c === 'matched') optionEmitCounter.includeMatched += 1
        else if (c === 'exact') optionEmitCounter.includeExact += 1
        else if (c === 'deferred') optionEmitCounter.includeDeferred += 1
        else if (c === 'review') optionEmitCounter.includeReview += 1
        else if (c === 'decisions') optionEmitCounter.includeDecisions += 1
    }
    if (status === 'review-error') {
        optionEmitCounter.reviewErrors += 1
    }
}

const emitGroupedRows = async (
    enrichedRows: Array<{ account: any; status: MatchingStatus }>,
    decisionAccountIds: Set<string>,
    emittedKeys: Set<string>,
    optionEmitCounter: DryRunOptionEmitCounter,
    emitRow: (payload: Record<string, unknown>) => Promise<void>,
    runtimeOptions: DryRunRuntimeOptions,
    fusionIdentityAttribute: string,
    tagFusionSourceListingRows: boolean
): Promise<number> => {
    const selectedCategories = new Set<ReportCategory>()
    if (runtimeOptions.includeExisting) {
        selectedCategories.add('existing-fusion')
    }
    if (runtimeOptions.includeNonMatched) selectedCategories.add('nonMatched')
    if (runtimeOptions.includeMatched) selectedCategories.add('matched')
    if (runtimeOptions.includeExact) selectedCategories.add('exact')
    if (runtimeOptions.includeDeferred) selectedCategories.add('deferred')
    if (runtimeOptions.includeReview) selectedCategories.add('review')
    if (runtimeOptions.includeDecisions) selectedCategories.add('decisions')

    if (selectedCategories.size === 0) {
        return 0
    }

    const groupedRows = new Map<
        ReportCategory,
        Array<{ account: any; status: MatchingStatus; categories: ReportCategory[] }>
    >()
    for (const category of CATEGORY_ORDER) groupedRows.set(category, [])
    for (const enriched of enrichedRows) {
        let rowCategories = categorizeRow(
            enriched.account,
            enriched.status,
            decisionAccountIds,
            fusionIdentityAttribute
        )
        if (tagFusionSourceListingRows) {
            rowCategories = [...rowCategories, 'existing-fusion']
        }
        rowCategories = rowCategories.filter((category) => selectedCategories.has(category))
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
            const attributes = { ...(row.account.attributes ?? {}) }
            const { matching, review, ...cleanAttributes } = attributes

            const includeReview = row.categories.includes('review') || row.categories.includes('decisions')
            const { sourceContext: sourceStatus, correlationContext: correlationStatus, ...matchingStatus } = matching ?? {}
            const relatedRaw = row.account.attributes?.accounts
            const relatedIds = Array.isArray(relatedRaw) ? relatedRaw.map((x) => String(x)) : []
            const reviewStatus = {
                pendingReviews: Boolean(review?.pending),
                hasDecisions: relatedIds.some((id) => decisionAccountIds.has(id)),
            }
            await emitRow({
                reportCategories: row.categories,
                matchingStatus,
                sourceStatus,
                reviewStatus,
                ...(correlationStatus !== undefined ? { correlationStatus } : {}),
                ...(includeReview ? { review } : {}),
                account: {
                    key: row.account.key,
                    attributes: cleanAttributes,
                    disabled: row.account.disabled,
                },
            })
            bumpOptionEmitCountsForRow(row.categories, row.status, optionEmitCounter)
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

export const refreshUniqueAttributesForDryRun = async (
    serviceRegistry: ServiceRegistry,
    analyzedManagedAccounts: FusionAccount[],
    runtimeOptions: DryRunRuntimeOptions
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

