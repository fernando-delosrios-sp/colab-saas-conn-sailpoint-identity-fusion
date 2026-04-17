import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { mkdir, writeFile } from 'fs/promises'
import * as path from 'path'
import { readArray, readBoolean, readNumber } from '../utils/safeRead'
import { ServiceRegistry } from '../services/serviceRegistry'
import { sanitizeRecipients } from '../services/messagingService/email'
import {
    buildDryRunSummary,
    buildReportAccountIndex,
    createDryRunOptionEmitCounter,
} from './helpers/buildDryRunPayload'
import { buildEmailReportFromFusionReport, hydrateIdentitiesForReportDecisions } from './helpers/generateReport'
import {
    buildStatsForDryRun,
    createDryRunRowEmitter,
    DryRunRuntimeOptions,
    hostnameSegmentFromBaseurl,
    streamEnrichedOutputRows,
    streamOrphanDeferredReportRows,
    streamUncorrelatedAnalyzedRows,
    refreshUniqueAttributesForDryRun,
} from './helpers/dryRunHelpers'
import {
    CorePipelineOptions,
    setupPhase,
    fetchPhase,
    processPhase,
} from './helpers/corePipeline'

const REPORT_DISK_SUBDIR = 'reports'

const buildDryRunHtmlReportPath = (baseurl: string | undefined): string => {
    const hostSeg = hostnameSegmentFromBaseurl(baseurl)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    return path.join(process.cwd(), REPORT_DISK_SUBDIR, `dry-run-${hostSeg}-${stamp}.html`)
}

const buildDryRunRuntimeOptions = (input: StdAccountListInput): DryRunRuntimeOptions => {
    return {
        includeExisting: readBoolean(input, 'includeExisting', false),
        includeNonMatched: readBoolean(input, 'includeNonMatched', false),
        includeMatched: readBoolean(input, 'includeMatched', false),
        includeExact: readBoolean(input, 'includeExact', false),
        includeDeferred: readBoolean(input, 'includeDeferred', false),
        includeReview: readBoolean(input, 'includeReview', false),
        includeDecisions: readBoolean(input, 'includeDecisions', false),
        writeToDisk: readBoolean(input, 'writeToDisk', false),
        sendReportTo: sanitizeRecipients(readArray(input, 'sendReportTo', [])),
    }
}

/**
 * custom:dryrun command - non-persistent aggregation analysis output.
 *
 * This command analyzes managed accounts against fusion identities and streams
 * final ISC account rows with a `matching` payload in attributes (unless
 * `writeToDisk` is true, in which case rows plus the same summary object are written as
 * pretty-printed JSON (`{ "summary": {...}, "rows": [...] }`) under `./reports` and
 * only the summary is returned). It shares the same setup and process phases as
 * std:account:list to ensure perfect consistency, but uses isPersistent=false to inhibit
 * persistence and external API side-effects.
 */
export const dryRun = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, sources, fusion, forms } = serviceRegistry
    const options: CorePipelineOptions = { mode: { kind: 'dry-run' } }

    try {
        const timer = log.timer()
        log.info('Starting custom:dryrun')
        const { res } = serviceRegistry
        if (typeof res.keepAlive === 'function') {
            res.keepAlive()
        }
        const runtimeOptions = buildDryRunRuntimeOptions(input)

        const rowEmitter = await createDryRunRowEmitter(serviceRegistry, runtimeOptions)

        const shouldContinue = await setupPhase(serviceRegistry, input.schema, options)
        if (!shouldContinue) return
        timer.phase('PHASE 1: Setup and initialization')

        const fetchResult = await fetchPhase(serviceRegistry, options)
        timer.phase('PHASE 2: Fetching data in parallel')

        await processPhase(serviceRegistry, options)
        timer.phase('PHASE 3: Work queue depletion and form reconciliation')

        const issueSummary = log.getAggregationIssueSummary()
        const fusionCounts = {
            fusionAccountsFound: sources.fusionAccountCount,
            totalFusionAccounts: readNumber(fusion, 'totalFusionAccountCount', sources.fusionAccountCount),
        }
        const dryRunStats = buildStatsForDryRun(fetchResult, issueSummary, timer.totalElapsed(), fusionCounts)
        const report = fusion.generateReport(true, dryRunStats)
        const reportIndex = buildReportAccountIndex(report.accounts)
        const pendingReviewByAccountId = forms.pendingReviewContextByAccountId
        const decisionAccountIds = new Set((report.fusionReviewDecisions ?? []).map((decision) => decision.accountId))
        const coveredManagedAccountIds = new Set<string>()
        const emittedRowKeys = new Set<string>()
        const optionEmitCounter = createDryRunOptionEmitCounter()

        let sentRows = 0
        try {
            // Baseline + identity-linked items found via existing records
            sentRows = await streamEnrichedOutputRows(
                serviceRegistry,
                reportIndex,
                pendingReviewByAccountId,
                decisionAccountIds,
                coveredManagedAccountIds,
                emittedRowKeys,
                optionEmitCounter,
                rowEmitter,
                runtimeOptions
            )

            // Uncorrelated managed accounts (nonMatched, newly matched, exact, etc.) still in the
            // work queue after the report stream: analyze without mutating state (unlike
            // processManagedAccounts) and emit them.
            const analyzedUncorrelatedAccounts = await fusion.analyzeUncorrelatedAccounts()
            if (analyzedUncorrelatedAccounts.length > 0) {
                // Ensure they have unique attributes assigned for valid platform representations
                await refreshUniqueAttributesForDryRun(serviceRegistry, analyzedUncorrelatedAccounts, runtimeOptions)

                sentRows = await streamUncorrelatedAnalyzedRows(
                    serviceRegistry,
                    analyzedUncorrelatedAccounts,
                    reportIndex,
                    pendingReviewByAccountId,
                    decisionAccountIds,
                    coveredManagedAccountIds,
                    emittedRowKeys,
                    optionEmitCounter,
                    rowEmitter,
                    sentRows,
                    runtimeOptions
                )
            }

            // Deferred same-aggregation matches do not create a fusion account in the run, so 
            // the managed account id never appears on any `forEachISCAccount` row. Emit synthetic 
            // ISC-shaped stubs so we keep the deferred tracking aligning with original categories.
            sentRows += await streamOrphanDeferredReportRows(
                serviceRegistry,
                report.accounts,
                reportIndex,
                pendingReviewByAccountId,
                decisionAccountIds,
                coveredManagedAccountIds,
                emittedRowKeys,
                optionEmitCounter,
                rowEmitter,
                runtimeOptions
            )
        } finally {
            if (!runtimeOptions.writeToDisk) {
                try {
                    await rowEmitter.close()
                } catch {
                    /* ignore close errors after a failed run */
                }
            }
        }

        timer.phase('PHASE 4: Streaming enriched ISC account rows')
        let reportHtmlOutputPath: string | undefined
        const shouldWriteHtmlReport = runtimeOptions.writeToDisk
        const shouldSendReportEmail = (runtimeOptions.sendReportTo?.length ?? 0) > 0
        if (shouldWriteHtmlReport || shouldSendReportEmail) {
            await hydrateIdentitiesForReportDecisions(serviceRegistry)
            const emailReport = buildEmailReportFromFusionReport(serviceRegistry, report, dryRunStats)
            const htmlReportBody = serviceRegistry.messaging.renderFusionReportHtml(
                emailReport,
                'aggregation',
                'Identity Fusion Dry Run Report'
            )

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
                    reportType: 'aggregation',
                    reportTitle: 'Identity Fusion Dry Run Report',
                })
            }
        }

        const summary = buildDryRunSummary({
            sentRows,
            optionEmitCounter,
            reportOptions: runtimeOptions,
            reportAccounts: report.accounts,
            issueSummary,
            totalProcessingTime: timer.totalElapsed(),
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
        timer.phase('PHASE 5: Building and sending summary')

        fusion.clearAnalyzedAccounts()
        sources.clearManagedAccounts()
        sources.clearFusionAccounts()

        const doneMsg = runtimeOptions.writeToDisk
            ? `✓ custom:dryrun completed successfully - ${sentRows} account row(s) written to disk; summary sent (${rowEmitter.diskOutputPath ?? 'n/a'})`
            : `✓ custom:dryrun completed successfully - ${sentRows} account row(s) sent`
        timer.end(doneMsg)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        console.error(error); log.crash('Failed to run custom:dryrun', error)
    }
}
