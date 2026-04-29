import { SourceType } from '../model/config'
import { FusionAccount } from '../model/account'
import { FusionDecision } from '../model/form'
import { readNumber, readString } from '../utils/safeRead'
import { createUrlContext } from '../utils/url'
import { PhaseTimer } from './logService'
import { mkdir, writeFile } from 'fs/promises'
import * as path from 'path'
import type { FusionService } from './fusionService'
import type {
    AggregationStats,
    FusionReport,
    FusionReportDecision,
    FusionReportStats,
} from './fusionService/types'
import type { FormService } from './formService'
import type { IdentityService } from './identityService'
import type { LogService } from './logService'
import type { MessagingService } from './messagingService'
import type { SourceService } from './sourceService'

type DryRunRuntimeOptions = { writeToDisk?: boolean; sendReportTo?: string[] }

type DryRunStats = AggregationStats & {
    aggregationWarnings: number
    aggregationErrors: number
    warningSamples: string[]
    errorSamples: string[]
    usedMemory: string
    identitiesFound: number
    managedAccountsFound: number
    managedAccountsFoundAuthoritative: number
    managedAccountsFoundRecord: number
    managedAccountsFoundOrphan: number
    fusionAccountsFound?: number
    totalFusionAccounts?: number
}

const toReportDecision = (
    decision: FusionDecision,
    resolveSourceType?: (sourceName?: string) => SourceType | undefined,
    resolveReviewerName?: (reviewerId?: string) => string | undefined,
    resolveReviewerUrl?: (reviewerId?: string) => string | undefined,
    resolveAccountUrl?: (accountId?: string) => string | undefined,
    resolveIdentityContext?: (identityId?: string) => { selectedIdentityName?: string; selectedIdentityUrl?: string }
): FusionReportDecision => {
    const sourceType =
        decision.sourceType ?? resolveSourceType?.(decision.account.sourceName) ?? SourceType.Authoritative
    const isNoMatchSource = sourceType === SourceType.Record || sourceType === SourceType.Orphan
    const decisionType = decision.newIdentity
        ? isNoMatchSource
            ? 'confirm-no-match'
            : 'create-new-identity'
        : 'assign-existing-identity'

    const decisionLabel =
        decisionType === 'assign-existing-identity'
            ? 'Assigned to existing identity'
            : decisionType === 'create-new-identity'
              ? 'Created new identity'
              : 'Confirmed no match'

    const selectedIdentityContext = resolveIdentityContext?.(decision.identityId) ?? {}
    const reviewerName =
        decision.submitter.name || resolveReviewerName?.(decision.submitter.id) || decision.submitter.id
    const selectedIdentityName =
        decision.identityName || selectedIdentityContext.selectedIdentityName || decision.identityId
    const correlatedIdentityContext = resolveIdentityContext?.(readString(decision, 'correlatedIdentityId')) ?? {}
    const correlatedAccountName = correlatedIdentityContext.selectedIdentityName

    const reviewerId = decision.submitter.id
    const reviewerUrl = reviewerId && reviewerId !== 'system' ? resolveReviewerUrl?.(reviewerId) : undefined

    return {
        reviewerId,
        reviewerName,
        reviewerUrl,
        reviewerEmail: decision.submitter.email || undefined,
        accountId: decision.account.id,
        accountName: correlatedAccountName || decision.account.name || decision.account.id,
        accountUrl: resolveAccountUrl?.(decision.account.id),
        accountSource: decision.account.sourceName || '',
        sourceType,
        decision: decisionType,
        decisionLabel,
        selectedIdentityId: decision.identityId || undefined,
        selectedIdentityName,
        selectedIdentityUrl: selectedIdentityContext.selectedIdentityUrl,
        comments: decision.comments || undefined,
        formUrl: decision.formUrl || undefined,
        automaticAssignment: decision.automaticAssignment === true ? true : undefined,
    }
}

/**
 * Builds fusion review report payloads and orchestrates dry-run report output.
 * This service centralizes report stats/decision shaping plus optional HTML and email delivery.
 */
export class ReportService {
    private static readonly REPORT_DISK_SUBDIR = 'reports'
    private static readonly DRY_RUN_REPORT_TYPE = 'aggregation' as const
    private static readonly DRY_RUN_REPORT_TITLE = 'Identity Fusion Dry Run Report'
    private dryRunRuntimeOptions: DryRunRuntimeOptions = {}

    constructor(
        private baseurl: string,
        private log: LogService,
        private sources: SourceService,
        private identities: IdentityService,
        private forms: FormService,
        private fusion: FusionService,
        private messaging: MessagingService
    ) {}

    /** Configure operation-scoped dry-run report output behavior. */
    public setDryRunRuntimeOptions(runtimeOptions: DryRunRuntimeOptions): void {
        this.dryRunRuntimeOptions = { ...runtimeOptions }
    }

    /** Ensure the local report output directory exists and return its absolute path. */
    public async ensureReportOutputDirectoryExists(): Promise<string> {
        if (typeof this.messaging.ensureReportOutputDirectoryExists === 'function') {
            return this.messaging.ensureReportOutputDirectoryExists(ReportService.REPORT_DISK_SUBDIR)
        }
        const dir = path.join(process.cwd(), ReportService.REPORT_DISK_SUBDIR)
        await mkdir(dir, { recursive: true })
        return dir
    }

    /**
     * Preload identities referenced by finished decisions so reviewer/identity metadata can be rendered in reports.
     */
    public async hydrateIdentitiesForReportDecisions(): Promise<void> {
        const finishedDecisions = this.forms.finishedFusionDecisions ?? []
        const idsToHydrate = new Set<string>()
        for (const decision of finishedDecisions) {
            if (decision?.submitter?.id) idsToHydrate.add(decision.submitter.id)
            if (decision?.identityId) idsToHydrate.add(decision.identityId)
        }
        if (typeof (this.identities as any).hydrateMissingIdentitiesById === 'function') {
            await this.identities.hydrateMissingIdentitiesById([...idsToHydrate])
            return
        }
        // Backward-compatible path for legacy test doubles that only mock get/fetch by id.
        await Promise.all(
            [...idsToHydrate]
                .filter((id) => !this.identities.getIdentityById(id))
                .map((id) => this.identities.fetchIdentityById(id).catch(() => {}))
        )
    }

    /** Build normalized review-decision entries for report rendering. */
    public buildFusionReviewDecisions(): FusionReportDecision[] {
        const finishedDecisions = this.forms.finishedFusionDecisions ?? []
        const urlContext = createUrlContext(this.baseurl)
        const resolveSourceType = (sourceName?: string): SourceType | undefined =>
            this.sources.getSourceByNameSafe(sourceName)?.sourceType
        const resolveReviewerName = (reviewerId?: string): string | undefined => {
            if (!reviewerId) return undefined
            const reviewer = this.identities.getIdentityById(reviewerId)
            return (
                (reviewer as any)?.displayName ||
                (reviewer as any)?.attributes?.displayName ||
                (reviewer as any)?.name ||
                undefined
            )
        }
        const resolveReviewerUrl = (reviewerId?: string): string | undefined =>
            reviewerId ? urlContext.identity(reviewerId) : undefined
        const resolveAccountUrl = (accountId?: string): string | undefined => {
            if (!accountId) return undefined
            const reportAccountId = this.sources.resolveIscAccountIdForManagedKey(accountId) ?? accountId
            return urlContext.humanAccount(reportAccountId)
        }
        const resolveIdentityContext = (
            identityId?: string
        ): { selectedIdentityName?: string; selectedIdentityUrl?: string } => {
            if (!identityId) return {}
            const identity = this.identities.getIdentityById(identityId)
            const selectedIdentityName =
                (identity as any)?.displayName ||
                (identity as any)?.attributes?.displayName ||
                (identity as any)?.name ||
                identityId
            return {
                selectedIdentityName,
                selectedIdentityUrl: urlContext.identity(identityId),
            }
        }
        return finishedDecisions.map((decision) =>
            toReportDecision(
                decision,
                resolveSourceType,
                resolveReviewerName,
                resolveReviewerUrl,
                resolveAccountUrl,
                resolveIdentityContext
            )
        )
    }

    /**
     * Merge aggregation metrics with fusion-review counters and system diagnostics.
     * @param aggregationStats Existing aggregation-phase stats collected before report generation.
     * @returns Consolidated stats payload for the fusion report.
     */
    public buildFusionReportStats(aggregationStats: AggregationStats): FusionReportStats {
        const finishedDecisions = this.forms.finishedFusionDecisions ?? []
        const issueSummary = this.log.getAggregationIssueSummary()
        const decisionSourceType = (d: { sourceType?: SourceType }): SourceType =>
            d.sourceType ?? SourceType.Authoritative
        const decisionCountByType = { authoritative: 0, record: 0, orphan: 0 }
        let authoritativeNewIdentities = 0
        let recordNoMatches = 0
        let orphanNoMatches = 0
        let automaticMatches = 0
        for (const d of finishedDecisions) {
            const sourceType = decisionSourceType(d)
            if (sourceType === SourceType.Record) {
                decisionCountByType.record += 1
                if (d.newIdentity) recordNoMatches += 1
            } else if (sourceType === SourceType.Orphan) {
                decisionCountByType.orphan += 1
                if (d.newIdentity) orphanNoMatches += 1
            } else {
                decisionCountByType.authoritative += 1
                if (d.newIdentity) authoritativeNewIdentities += 1
            }
            if (d.automaticAssignment === true) automaticMatches += 1
        }
        const memoryUsage = process.memoryUsage()
        return {
            totalFusionAccounts: this.fusion.totalFusionAccountCount,
            fusionAccountsFound: this.sources.fusionAccountCount,
            fusionReviewsCreated: this.forms.formsCreated,
            fusionReviewAssignments: this.forms.formInstancesCreated,
            fusionReviewsFound: this.forms.formsFound,
            fusionReviewInstancesFound: this.forms.formInstancesFound,
            fusionAutomaticMatches: automaticMatches,
            fusionReviewsProcessed: this.forms.answeredFormInstancesProcessed,
            fusionReviewNewIdentities: authoritativeNewIdentities,
            fusionReviewNonMatches: recordNoMatches + orphanNoMatches,
            fusionReviewDecisionsAuthoritative: decisionCountByType.authoritative,
            fusionReviewDecisionsRecord: decisionCountByType.record,
            fusionReviewDecisionsOrphan: decisionCountByType.orphan,
            fusionReviewNewIdentitiesAuthoritative: authoritativeNewIdentities,
            fusionReviewNoMatchesRecord: recordNoMatches,
            fusionReviewNoMatchesOrphan: orphanNoMatches,
            managedAccountsProcessed: this.fusion.newManagedAccountsCount,
            identitiesProcessed: this.fusion.identitiesProcessedCount,
            aggregationWarnings: issueSummary.warningCount,
            aggregationErrors: issueSummary.errorCount,
            warningSamples: issueSummary.warningSamples,
            errorSamples: issueSummary.errorSamples,
            usedMemory: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            ...aggregationStats,
        }
    }

    /**
     * Build an email-ready report by filtering accounts and injecting computed stats/decisions.
     * @param baseReport Raw report generated from fusion aggregation results.
     * @param aggregationStats Current aggregation metrics to fold into report stats.
     */
    public buildEmailReportFromFusionReport(baseReport: FusionReport, aggregationStats: AggregationStats): FusionReport {
        const reportDecisions = this.buildFusionReviewDecisions()
        const stats = this.buildFusionReportStats(aggregationStats)
        const accounts = (baseReport.accounts ?? []).filter((account) => {
            const hasMatches = Array.isArray(account.matches) && account.matches.length > 0
            return hasMatches || account.deferred === true || typeof account.error === 'string'
        })
        const matchAccountCount = accounts.filter(
            (account) => Array.isArray(account.matches) && account.matches.length > 0
        ).length
        return {
            ...baseReport,
            accounts,
            totalAccounts: baseReport.totalAccounts ?? accounts.length,
            matches: baseReport.matches ?? matchAccountCount,
            stats,
            fusionReviewDecisions: reportDecisions,
        }
    }

    /**
     * Finalize report-phase timing into both mutable dry-run stats and the report payload.
     * @returns HTML output path when provided by writer stage; otherwise undefined.
     */
    public applyDryRunReportPhaseTiming(params: {
        report: FusionReport
        finalDryRunStats: AggregationStats
        phaseBreakdownThroughOutput: NonNullable<AggregationStats['phaseTiming']>
        reportPhaseStartedAt: number
        writeResult?: {
            reportHtmlOutputPath?: string
            statsWithPhaseTiming: AggregationStats
        }
    }): string | undefined {
        const { report, finalDryRunStats, phaseBreakdownThroughOutput, reportPhaseStartedAt, writeResult } = params

        if (writeResult) {
            Object.assign(finalDryRunStats, { phaseTiming: writeResult.statsWithPhaseTiming.phaseTiming })
            report.stats = { ...report.stats, ...writeResult.statsWithPhaseTiming }
            return writeResult.reportHtmlOutputPath
        }

        const reportOnlyElapsedMs = Date.now() - reportPhaseStartedAt
        const fullBreakdown = [
            ...phaseBreakdownThroughOutput,
            { phase: 'Report', elapsed: PhaseTimer.formatElapsed(reportOnlyElapsedMs) },
        ]
        Object.assign(finalDryRunStats, { phaseTiming: fullBreakdown })
        report.stats = { ...report.stats, phaseTiming: fullBreakdown }
        return undefined
    }

    /** Build dry-run stats snapshot from fetch counters, timing, warnings/errors, and memory usage. */
    public buildDryRunStats(params: {
        fetchResult: {
            identitiesFound: number
            managedAccountsFound: number
            managedAccountsFoundAuthoritative: number
            managedAccountsFoundRecord: number
            managedAccountsFoundOrphan: number
        }
        totalProcessingTime: string
        phaseTiming?: NonNullable<AggregationStats['phaseTiming']>
    }): DryRunStats {
        const { fetchResult, totalProcessingTime, phaseTiming } = params
        const issueSummary = this.log.getAggregationIssueSummary()
        const memoryUsage = process.memoryUsage()
        return {
            identitiesFound: fetchResult.identitiesFound,
            managedAccountsFound: fetchResult.managedAccountsFound,
            managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
            managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
            managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
            totalProcessingTime,
            ...(phaseTiming && phaseTiming.length > 0 ? { phaseTiming } : {}),
            aggregationWarnings: issueSummary.warningCount,
            aggregationErrors: issueSummary.errorCount,
            warningSamples: issueSummary.warningSamples,
            errorSamples: issueSummary.errorSamples,
            usedMemory: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            fusionAccountsFound: this.sources.fusionAccountCount,
            totalFusionAccounts: readNumber(this.fusion, 'totalFusionAccountCount', this.sources.fusionAccountCount),
        }
    }

    /**
     * Initialize dry-run reporting by creating pre-streaming stats and the initial report model.
     */
    public initializeDryRunReport(params: {
        fetchResult: {
            identitiesFound: number
            managedAccountsFound: number
            managedAccountsFoundAuthoritative: number
            managedAccountsFoundRecord: number
            managedAccountsFoundOrphan: number
        }
        totalProcessingTime: string
        phaseTiming?: NonNullable<AggregationStats['phaseTiming']>
        includeNonMatches?: boolean
    }): { report: FusionReport; preStreamingStats: DryRunStats } {
        const { fetchResult, totalProcessingTime, phaseTiming, includeNonMatches = true } = params
        const preStreamingStats = this.buildDryRunStats({
            fetchResult,
            totalProcessingTime,
            phaseTiming,
        })
        const report = this.fusion.generateReport(includeNonMatches, preStreamingStats)
        return { report, preStreamingStats }
    }

    /**
     * Finalize dry-run report output, including write/send operations and final report-phase timing.
     */
    public async finalizeDryRunReport(params: {
        report: FusionReport
        fetchResult: {
            identitiesFound: number
            managedAccountsFound: number
            managedAccountsFoundAuthoritative: number
            managedAccountsFoundRecord: number
            managedAccountsFoundOrphan: number
        }
        totalProcessingTime: string
        phaseBreakdownThroughOutput: NonNullable<AggregationStats['phaseTiming']>
    }): Promise<{ finalDryRunStats: AggregationStats; reportHtmlOutputPath?: string }> {
        const { report, fetchResult, totalProcessingTime, phaseBreakdownThroughOutput } = params
        const finalDryRunStats = this.buildDryRunStats({
            fetchResult,
            totalProcessingTime,
            phaseTiming: phaseBreakdownThroughOutput,
        })
        const reportPhaseStartedAt = Date.now()
        const writeResult = await this.writeAndSendDryRunReport({
            report,
            finalDryRunStats,
            reportPhaseStartedAt,
        })
        const reportHtmlOutputPath = this.applyDryRunReportPhaseTiming({
            report,
            finalDryRunStats,
            phaseBreakdownThroughOutput,
            reportPhaseStartedAt,
            writeResult,
        })
        return { finalDryRunStats, reportHtmlOutputPath }
    }

    /**
     * Render dry-run HTML and optionally write to disk and/or deliver via email.
     * @returns Output metadata used to persist report-phase timing when generation occurs.
     */
    public async writeAndSendDryRunReport(params: {
        report: FusionReport
        finalDryRunStats: AggregationStats
        reportPhaseStartedAt?: number
    }): Promise<
        | undefined
        | {
            reportHtmlOutputPath?: string
            statsWithPhaseTiming: AggregationStats
        }
    > {
        const { report, finalDryRunStats, reportPhaseStartedAt } = params
        const runtimeOptions = this.dryRunRuntimeOptions
        const shouldWriteHtmlReport = runtimeOptions.writeToDisk === true
        const shouldSendReportEmail = (runtimeOptions.sendReportTo?.length ?? 0) > 0
        if (!shouldWriteHtmlReport && !shouldSendReportEmail) return undefined

        await this.hydrateIdentitiesForReportDecisions()

        const baseTiming = finalDryRunStats.phaseTiming ?? []
        const reportElapsedMs = typeof reportPhaseStartedAt === 'number' ? Date.now() - reportPhaseStartedAt : 0
        const statsForRender: AggregationStats = {
            ...finalDryRunStats,
            phaseTiming:
                typeof reportPhaseStartedAt === 'number'
                    ? [...baseTiming, { phase: 'Report', elapsed: PhaseTimer.formatElapsed(reportElapsedMs) }]
                    : baseTiming,
        }

        if (typeof reportPhaseStartedAt === 'number') {
            this.log.info(`PHASE 7: Report — HTML/email and stats (${PhaseTimer.formatElapsed(reportElapsedMs)})`)
        }

        const emailReport = this.buildEmailReportFromFusionReport(report, statsForRender)
        const htmlReportBody = this.messaging.renderFusionReportHtml(
            emailReport,
            ReportService.DRY_RUN_REPORT_TYPE,
            ReportService.DRY_RUN_REPORT_TITLE
        )

        let reportHtmlOutputPath: string | undefined
        if (shouldWriteHtmlReport) {
            const htmlPath = this.buildDryRunHtmlReportPath()
            await this.ensureReportOutputDirectoryExists()
            await writeFile(htmlPath, htmlReportBody, 'utf8')
            reportHtmlOutputPath = htmlPath
            this.log.info(`dry-run wrote HTML report to ${htmlPath}`)
        }

        if (shouldSendReportEmail) {
            await this.messaging.deliverReportToRecipients(emailReport, {
                recipients: runtimeOptions.sendReportTo ?? [],
                reportType: ReportService.DRY_RUN_REPORT_TYPE,
                reportTitle: ReportService.DRY_RUN_REPORT_TITLE,
            })
        }

        return { reportHtmlOutputPath, statsWithPhaseTiming: statsForRender }
    }

    /**
     * Generate and send the standard fusion report for aggregation or ad-hoc fusion runs.
     */
    public async generateAndSendFusionReport(
        fusionAccount: FusionAccount,
        includeNonMatches: boolean,
        aggregationStats?: AggregationStats
    ): Promise<void> {
        await this.hydrateIdentitiesForReportDecisions()

        if (aggregationStats) {
            const reportPhaseTimer = this.log.timer()
            const stats = this.buildFusionReportStats(aggregationStats)
            const report = this.fusion.generateReport(includeNonMatches, stats)
            report.fusionReviewDecisions = this.buildFusionReviewDecisions()
            reportPhaseTimer.phase('PHASE 7: Report (fusion report)', 'info', 'Report')
            const priorPhases = aggregationStats.phaseTiming ?? []
            stats.phaseTiming = [...priorPhases, ...reportPhaseTimer.getPhaseBreakdown()]
            report.stats = stats
            await this.messaging.sendReport(report, fusionAccount, 'aggregation')
            return
        }

        const report = this.fusion.generateReport(includeNonMatches, undefined)
        report.fusionReviewDecisions = this.buildFusionReviewDecisions()
        await this.messaging.sendReport(report, fusionAccount, 'fusion')
        this.identities.clear()
    }

    /** Build a deterministic dry-run HTML file path scoped to host and timestamp. */
    private buildDryRunHtmlReportPath(): string {
        const hostSeg = this.hostnameSegmentFromBaseurl(this.baseurl)
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        return path.join(process.cwd(), ReportService.REPORT_DISK_SUBDIR, `dry-run-${hostSeg}-${stamp}.html`)
    }

    /** Derive a filesystem-safe host segment from base URL for report filenames. */
    private hostnameSegmentFromBaseurl(baseurl: string | undefined): string {
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
}
