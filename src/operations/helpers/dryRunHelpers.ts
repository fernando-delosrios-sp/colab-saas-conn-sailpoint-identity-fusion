import { createReadStream, createWriteStream, type WriteStream } from 'fs'
import { mkdir, unlink, writeFile } from 'fs/promises'
import * as path from 'path'
import { finished, pipeline } from 'stream/promises'
import { StdAccountListOutput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { FusionReportAccount } from '../../services/fusionService/types'
import { isExactAttributeMatchScores } from '../../services/scoringService/exactMatch'
import { FusionAccount } from '../../model/account'
import { readArray, readBoolean, readPathString, readUnknown } from '../../utils/safeRead'
import {
    buildReportAccountIndex,
    buildDryRunSummary,
    createDryRunOptionEmitCounter,
    DryRunInputOptions,
    DryRunOptionEmitCounter,
    DryRunSummary,
    enrichISCAccountWithMatching,
    MatchingStatus,
    PendingReviewContextByAccountId,
} from './buildDryRunPayload'
import { defaults } from '../../data/config'
import { buildEmailReportFromFusionReport, hydrateIdentitiesForReportDecisions } from './generateReport'

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

type DryRunStreamingContext = {
    reportIndex: ReturnType<typeof buildReportAccountIndex>
    pendingReviewByAccountId: PendingReviewContextByAccountId
    decisionAccountIds: Set<string>
    coveredManagedAccountIds: Set<string>
    emittedRowKeys: Set<string>
    optionEmitCounter: ReturnType<typeof createDryRunOptionEmitCounter>
}

type DryRunFinalizationInput = {
    sentRows: number
    optionEmitCounter: ReturnType<typeof createDryRunOptionEmitCounter>
    runtimeOptions: DryRunRuntimeOptions
    rowEmitter: DryRunRowEmitter
    report: ReturnType<ServiceRegistry['fusion']['generateReport']>
    issueSummary: ReturnType<ServiceRegistry['log']['getAggregationIssueSummary']>
    canonicalTotalProcessingTime: string
    reportHtmlOutputPath?: string
}

const REPORT_DISK_SUBDIR = 'reports'
const DRY_RUN_REPORT_TYPE = 'aggregation' as const
const DRY_RUN_REPORT_TITLE = 'Identity Fusion Dry Run Report'

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

const buildDryRunHtmlReportPath = (baseurl: string | undefined): string => {
    const hostSeg = hostnameSegmentFromBaseurl(baseurl)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    return path.join(process.cwd(), REPORT_DISK_SUBDIR, `dry-run-${hostSeg}-${stamp}.html`)
}

const closeRowEmitterQuietly = async (rowEmitter: DryRunRowEmitter) => {
    try {
        await rowEmitter.close()
    } catch {
        /* ignore close errors after a failed run */
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

// Regex to prepend 4-space indent to every line in a single pass (avoids split/map/join allocations)
const INDENT_4_RE = /^/gm

async function writePrettyJsonArrayElement(stream: WriteStream, obj: unknown, isFirst: number): Promise<void> {
    const prefix = isFirst === 0 ? '' : ',\n'
    const body = JSON.stringify(obj, null, 2)
    const indented = body.replace(INDENT_4_RE, '    ')
    await writeChunk(stream, prefix + indented)
}

/**
 * Routes detail rows either through `res.send` (streaming) or to a pretty-printed JSON file under `./reports`
 * shaped as `{ "summary": {...}, "rows": [...] }` (summary first so consumers can read metadata without scanning rows).
 */
export const createDryRunRowEmitter = async (
    serviceRegistry: ServiceRegistry,
    runtimeOptions: DryRunRuntimeOptions
): Promise<DryRunRowEmitter> => {
    const { log, res } = serviceRegistry

    if (!runtimeOptions.writeToDisk) {
        return {
            diskOutputPath: undefined,
            emitRow: async (payload: Record<string, unknown>) => {
                res.send(payload)
            },
            close: async () => {},
        }
    }

    const cwd = process.cwd()
    const dir = path.join(cwd, REPORT_DISK_SUBDIR)
    await mkdir(dir, { recursive: true })
    const hostSeg = hostnameSegmentFromBaseurl(serviceRegistry.config?.baseurl)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `dry-run-${hostSeg}-${stamp}.json`
    const diskOutputPath = path.join(dir, fileName)
    const rowsTempPath = `${diskOutputPath}.rows.tmp`
    const rowsStream = createWriteStream(rowsTempPath, { flags: 'w' })
    let arrayElementCount = 0

    log.info(`custom:dryrun writing detail rows to ${diskOutputPath} (rows buffer: ${rowsTempPath})`)

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
                // Use regex replace instead of split/map/join for the summary indentation (Fix #23)
                const indentedSummary = summaryJson.replace(/^/gm, '  ')
                const out = createWriteStream(diskOutputPath, { flags: 'w' })
                await writeChunk(out, '{\n  "summary": ' + indentedSummary + ',\n  "rows": [\n')
                // Stream the rows temp file into the output instead of reading it all into memory (Fix #11)
                if (arrayElementCount > 0) {
                    await pipeline(createReadStream(rowsTempPath), out, { end: false })
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
            ? {
                  fusionAccountsFound: fusionCounts.fusionAccountsFound,
                  totalFusionAccounts: fusionCounts.totalFusionAccounts,
              }
            : {}),
    }
}

const initializeDryRunStreamingContext = (
    serviceRegistry: ServiceRegistry,
    report: ReturnType<ServiceRegistry['fusion']['generateReport']>
): DryRunStreamingContext => {
    const { forms } = serviceRegistry
    return {
        reportIndex: buildReportAccountIndex(report.accounts),
        pendingReviewByAccountId: forms.pendingReviewContextByAccountId,
        decisionAccountIds: new Set((report.fusionReviewDecisions ?? []).map((decision) => decision.accountId)),
        coveredManagedAccountIds: new Set<string>(),
        emittedRowKeys: new Set<string>(),
        optionEmitCounter: createDryRunOptionEmitCounter(),
    }
}

export const streamDryRunRows = async (
    serviceRegistry: ServiceRegistry,
    report: ReturnType<ServiceRegistry['fusion']['generateReport']>,
    runtimeOptions: DryRunRuntimeOptions,
    rowEmitter: DryRunRowEmitter
) => {
    const { fusion } = serviceRegistry
    const streamContext = initializeDryRunStreamingContext(serviceRegistry, report)
    let sentRows = 0

    try {
        sentRows = await streamEnrichedOutputRows(
            serviceRegistry,
            streamContext.reportIndex,
            streamContext.pendingReviewByAccountId,
            streamContext.decisionAccountIds,
            streamContext.coveredManagedAccountIds,
            streamContext.emittedRowKeys,
            streamContext.optionEmitCounter,
            rowEmitter,
            runtimeOptions
        )

        const analyzedUncorrelatedAccounts = await fusion.analyzeUncorrelatedAccounts()
        if (analyzedUncorrelatedAccounts.length > 0) {
            await refreshUniqueAttributesForDryRun(serviceRegistry, analyzedUncorrelatedAccounts, runtimeOptions)

            sentRows = await streamUncorrelatedAnalyzedRows(
                serviceRegistry,
                analyzedUncorrelatedAccounts,
                streamContext.reportIndex,
                streamContext.pendingReviewByAccountId,
                streamContext.decisionAccountIds,
                streamContext.coveredManagedAccountIds,
                streamContext.emittedRowKeys,
                streamContext.optionEmitCounter,
                rowEmitter,
                sentRows,
                runtimeOptions
            )
        }

        sentRows += await streamOrphanDeferredReportRows(
            serviceRegistry,
            report.accounts,
            streamContext.reportIndex,
            streamContext.pendingReviewByAccountId,
            streamContext.decisionAccountIds,
            streamContext.coveredManagedAccountIds,
            streamContext.emittedRowKeys,
            streamContext.optionEmitCounter,
            rowEmitter,
            runtimeOptions
        )
    } finally {
        if (!runtimeOptions.writeToDisk) {
            await closeRowEmitterQuietly(rowEmitter)
        }
    }

    return {
        sentRows,
        optionEmitCounter: streamContext.optionEmitCounter,
    }
}

export const writeAndSendDryRunReport = async (
    serviceRegistry: ServiceRegistry,
    report: ReturnType<ServiceRegistry['fusion']['generateReport']>,
    finalDryRunStats: ReturnType<typeof buildStatsForDryRun>,
    runtimeOptions: DryRunRuntimeOptions
) => {
    const { log } = serviceRegistry
    const shouldWriteHtmlReport = runtimeOptions.writeToDisk
    const shouldSendReportEmail = (runtimeOptions.sendReportTo?.length ?? 0) > 0

    if (!shouldWriteHtmlReport && !shouldSendReportEmail) return undefined

    await hydrateIdentitiesForReportDecisions(serviceRegistry)
    const emailReport = buildEmailReportFromFusionReport(serviceRegistry, report, finalDryRunStats)
    const htmlReportBody = serviceRegistry.messaging.renderFusionReportHtml(
        emailReport,
        DRY_RUN_REPORT_TYPE,
        DRY_RUN_REPORT_TITLE
    )

    let reportHtmlOutputPath: string | undefined
    if (shouldWriteHtmlReport) {
        const htmlPath = buildDryRunHtmlReportPath(serviceRegistry.config?.baseurl)
        await mkdir(path.dirname(htmlPath), { recursive: true })
        await writeFile(htmlPath, htmlReportBody, 'utf8')
        reportHtmlOutputPath = htmlPath
        log.info(`dry-run wrote HTML report to ${htmlPath}`)
    }

    if (shouldSendReportEmail) {
        await serviceRegistry.messaging.fetchSender()
        await serviceRegistry.messaging.sendReportTo(emailReport, {
            recipients: runtimeOptions.sendReportTo ?? [],
            reportType: DRY_RUN_REPORT_TYPE,
            reportTitle: DRY_RUN_REPORT_TITLE,
        })
    }

    return reportHtmlOutputPath
}

export const finalizeDryRun = async (
    serviceRegistry: ServiceRegistry,
    finalizationInput: DryRunFinalizationInput
) => {
    const { res, fusion, sources } = serviceRegistry
    const {
        sentRows,
        optionEmitCounter,
        runtimeOptions,
        rowEmitter,
        report,
        issueSummary,
        canonicalTotalProcessingTime,
        reportHtmlOutputPath,
    } = finalizationInput

    const summary = buildDryRunSummary({
        sentRows,
        optionEmitCounter,
        reportOptions: runtimeOptions,
        reportAccounts: report.accounts,
        issueSummary,
        totalProcessingTime: canonicalTotalProcessingTime,
        stats: report.stats,
        fusionReviewDecisionsCount: (report.fusionReviewDecisions ?? []).length,
        writeToDisk: runtimeOptions.writeToDisk,
        reportOutputPath: rowEmitter.diskOutputPath,
        reportHtmlOutputPath,
    })

    if (runtimeOptions.writeToDisk) {
        try {
            await rowEmitter.close(summary)
        } catch {
            /* ignore close errors after a failed run */
        }
    }

    res.send(summary)
    fusion.clearAnalyzedAccounts()
    sources.clearManagedAccounts()
    sources.clearFusionAccounts()

    return {
        sentRows,
        summary,
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
    const selectedCategories = buildSelectedCategories(runtimeOptions)
    if (selectedCategories.size === 0) {
        return 0
    }
    const groupedRows = createGroupedRows()
    const fusionIdentityAttribute = serviceRegistry.schemas.fusionIdentityAttribute ?? 'id'

    await fusion.forEachISCAccount((account) => {
        addCoveredManagedAccountIds(account, coveredManagedAccountIds)
        const enriched = enrichISCAccountWithMatching(
            account,
            reportIndex,
            pendingReviewByAccountId,
            serviceRegistry.config?.baseurl
        )
        addEnrichedRowToGroups(
            enriched,
            decisionAccountIds,
            selectedCategories,
            groupedRows,
            emittedRowKeys,
            fusionIdentityAttribute,
            true
        )
    })

    return await emitGroupedRows(
        groupedRows,
        optionEmitCounter,
        rowEmitter.emitRow,
        decisionAccountIds
    )
}

export const streamUncorrelatedAnalyzedRows = async (
    serviceRegistry: ServiceRegistry,
    analyzedUncorrelatedAccounts: FusionAccount[],
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
    const selectedCategories = buildSelectedCategories(runtimeOptions)
    if (selectedCategories.size === 0) {
        return 0
    }
    const groupedRows = createGroupedRows()
    const fusionIdentityAttribute = serviceRegistry.schemas.fusionIdentityAttribute ?? 'id'
    for (const analyzedAccount of analyzedUncorrelatedAccounts) {
        const output = await fusion.getISCAccount(analyzedAccount, false)
        if (!output) continue

        addCoveredManagedAccountIds(output, coveredManagedAccountIds)
        const enriched = enrichISCAccountWithMatching(
            output,
            reportIndex,
            pendingReviewByAccountId,
            serviceRegistry.config?.baseurl
        )
        addEnrichedRowToGroups(
            enriched,
            decisionAccountIds,
            selectedCategories,
            groupedRows,
            emittedRowKeys,
            fusionIdentityAttribute,
            false
        )
    }

    const emittedRows = await emitGroupedRows(
        groupedRows,
        optionEmitCounter,
        rowEmitter.emitRow,
        decisionAccountIds
    )
    const totalSentRows = sentRows + emittedRows
    log.info(`Uncorrelated managed account streaming emitted ${totalSentRows} row(s)`)
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
    const selectedCategories = buildSelectedCategories(runtimeOptions)
    if (selectedCategories.size === 0) {
        return 0
    }
    const groupedRows = createGroupedRows()
    const stubs: StdAccountListOutput[] = []
    for (const ra of reportAccounts) {
        if (!ra.deferred || !ra.accountId || ra.matches.length === 0) continue
        if (coveredManagedAccountIds.has(ra.accountId)) continue
        stubs.push(buildOrphanDeferredStubOutput(ra.accountId))
    }
    if (stubs.length === 0) {
        return 0
    }

    const fusionIdentityAttribute = serviceRegistry.schemas.fusionIdentityAttribute ?? 'id'
    for (const stub of stubs) {
        const enriched = enrichISCAccountWithMatching(stub, reportIndex, pendingReviewByAccountId, serviceRegistry.config?.baseurl)
        addEnrichedRowToGroups(
            enriched,
            decisionAccountIds,
            selectedCategories,
            groupedRows,
            emittedRowKeys,
            fusionIdentityAttribute,
            false
        )
    }

    return await emitGroupedRows(
        groupedRows,
        optionEmitCounter,
        rowEmitter.emitRow,
        decisionAccountIds
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
type GroupedRow = { account: any; status: MatchingStatus; categories: ReportCategory[] }

/** Non-empty value for the fusion schema identity attribute (e.g. correlated ISC identity id). */
const fusionIdentityAttributeValue = (attributes: any, attributeName: string): string => {
    if (!attributes || typeof attributes !== 'object') return ''
    const v = readUnknown(attributes, attributeName)
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
    const attributes = readUnknown(enrichedAccount, 'attributes')
    const statuses = new Set<string>(readArray<string>(attributes, 'statuses', []))
    const relatedAccounts = readArray<string>(attributes, 'accounts', [])

    if (statuses.has('baseline')) {
        categories.push('baseline')
    } else if (fusionIdentityAttributeValue(attributes, fusionIdentityAttribute)) {
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
        if (
            matches.some((m: { scores?: Parameters<typeof isExactAttributeMatchScores>[0] }) =>
                isExactAttributeMatchScores(m.scores)
            )
        ) {
            categories.push('exact')
        }
    }
    if (status === 'deferred') categories.push('deferred')

    const reviewPending = readBoolean(
        readUnknown(readUnknown(enrichedAccount, 'attributes'), 'review'),
        'pending',
        false
    )
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
    groupedRows: Map<ReportCategory, GroupedRow[]>,
    optionEmitCounter: DryRunOptionEmitCounter,
    emitRow: (payload: Record<string, unknown>) => Promise<void>,
    decisionAccountIds: Set<string>
): Promise<number> => {
    let emittedRows = 0
    for (const category of CATEGORY_ORDER) {
        const rows = groupedRows.get(category) ?? []
        for (const row of rows) {
            const attributes = { ...(row.account.attributes ?? {}) }
            const { matching, review, ...cleanAttributes } = attributes

            const includeReview = row.categories.includes('review') || row.categories.includes('decisions')
            const { sourceContext: sourceStatus, correlationContext: correlationStatus, ...matchingStatus } = matching ?? {}
            const relatedRaw = readUnknown(readUnknown(row.account, 'attributes'), 'accounts')
            const relatedIds = Array.isArray(relatedRaw) ? relatedRaw.map((x) => String(x)) : []
            const reviewStatus = {
                pendingReviews: readBoolean(review, 'pending', false),
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

const buildSelectedCategories = (runtimeOptions: DryRunRuntimeOptions): Set<ReportCategory> => {
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
    return selectedCategories
}

const createGroupedRows = (): Map<ReportCategory, GroupedRow[]> => {
    const groupedRows = new Map<ReportCategory, GroupedRow[]>()
    for (const category of CATEGORY_ORDER) groupedRows.set(category, [])
    return groupedRows
}

const addEnrichedRowToGroups = (
    enriched: { account: any; status: MatchingStatus },
    decisionAccountIds: Set<string>,
    selectedCategories: Set<ReportCategory>,
    groupedRows: Map<ReportCategory, GroupedRow[]>,
    emittedKeys: Set<string>,
    fusionIdentityAttribute: string,
    tagFusionSourceListingRows: boolean
): void => {
    let rowCategories = categorizeRow(enriched.account, enriched.status, decisionAccountIds, fusionIdentityAttribute)
    if (tagFusionSourceListingRows) {
        rowCategories = [...rowCategories, 'existing-fusion']
    }
    rowCategories = rowCategories.filter((category) => selectedCategories.has(category))
    if (rowCategories.length === 0) return

    const firstCategory = rowCategories[0]
    const key = getEmissionKey(enriched.account)
    if (emittedKeys.has(key)) return

    groupedRows.get(firstCategory)?.push({ ...enriched, categories: rowCategories })
    emittedKeys.add(key)
}

const getEmissionKey = (account: any): string => {
    const keySimple = readPathString(account, ['key', 'simple', 'id'])
    if (keySimple) return String(keySimple)
    const key = readUnknown(account, 'key')
    if (key !== undefined && key !== null) return String(key)
    const attributeId = readPathString(account, ['attributes', 'id'])
    if (attributeId) return attributeId
    const originAccount = readPathString(account, ['attributes', 'originAccount'])
    if (originAccount) return originAccount
    return JSON.stringify(readUnknown(readUnknown(account, 'attributes'), 'accounts') ?? [])
}

export const refreshUniqueAttributesForDryRun = async (
    serviceRegistry: ServiceRegistry,
    analyzedUncorrelatedAccounts: FusionAccount[],
    runtimeOptions: DryRunRuntimeOptions
): Promise<void> => {
    const { fusion, attributes, log } = serviceRegistry

    // Refresh unique attributes only for the account types we may emit.
    // Otherwise, incremental counter-based IDs can be consumed by rows that are never sent
    // (e.g. identity-origin fusion accounts when includeExisting=false), making report-only runs appear to "skip" numbers.
    //
    // Note: some unit-test mocks provide fusion.refreshUniqueAttributes() but not fusionAccounts/fusionIdentities getters.
    // Fall back to the legacy call in that case to keep tests and mocks stable.
    const batchSize = serviceRegistry.config?.managedAccountsBatchSize ?? defaults.managedAccountsBatchSize
    const fusionAccounts = readUnknown(fusion, 'fusionAccounts') as FusionAccount[] | undefined
    const fusionIdentities = readUnknown(fusion, 'fusionIdentities') as Iterable<FusionAccount> | undefined
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

    // Also refresh analyzed managed accounts that only surface on the uncorrelated-queue path.
    if (analyzedUncorrelatedAccounts.length === 0) return
    const stableAnalyzed = [...analyzedUncorrelatedAccounts].sort((a: any, b: any) => {
        const aKey = String(
            readUnknown(a, 'originAccountId') ??
                readPathString(a, ['attributes', 'originAccount']) ??
                readUnknown(a, 'nativeIdentity') ??
                readUnknown(a, 'key') ??
                readUnknown(a, 'name') ??
                ''
        )
        const bKey = String(
            readUnknown(b, 'originAccountId') ??
                readPathString(b, ['attributes', 'originAccount']) ??
                readUnknown(b, 'nativeIdentity') ??
                readUnknown(b, 'key') ??
                readUnknown(b, 'name') ??
                ''
        )
        return aKey.localeCompare(bKey)
    })
    for (let i = 0; i < stableAnalyzed.length; i += batchSize) {
        const batch = stableAnalyzed.slice(i, i + batchSize)
        await Promise.all(batch.map((account) => attributes.refreshUniqueAttributes(account)))
    }

    log.info(`Unique attributes refreshed for ${analyzedUncorrelatedAccounts.length} analyzed uncorrelated account(s)`)
}
