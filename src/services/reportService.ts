import { SourceType } from '../model/config'
import { FusionDecision } from '../model/form'
import { readString, trimStr } from '../utils/safeRead'
import { createUrlContext } from '../utils/url'
import { PhaseTimer } from './logService'
import { mkdir, writeFile } from 'fs/promises'
import * as path from 'path'
import type { FusionService } from './fusionService'
import { AggregationTracker as _AggregationTracker } from './fusionService/aggregationTracker'
import type { AggregationStats, FusionReport, FusionReportDecision, FusionReportStats } from './fusionService/types'
import type { FormService } from './formService'
import type { IdentityService } from './identityService'
import type { LogService } from './logService'
import type { EmailService } from './emailService'
import type { SourceService } from './sourceService'
import { FusionRun } from '../model/fusionRun'
import { compileEmailTemplates, renderFusionReport, FusionReportEmailData } from './emailService/helpers'
import { registerHandlebarsHelpers } from './emailService/messagingHandlebarsRegistration'
import { sanitizeRecipients } from './emailService/email'

type DryRunRuntimeOptions = { writeToDisk?: boolean; sendReportTo?: string[] }

type DryRunStats = AggregationStats & FusionReportStats

const toReportDecision = (
    decision: FusionDecision,
    resolveSourceType?: (sourceName?: string) => SourceType | undefined,
    resolveReviewerName?: (reviewerId?: string) => string | undefined,
    resolveReviewerUrl?: (reviewerId?: string) => string | undefined,
    resolveAccountName?: (managedAccountKey?: string) => string | undefined,
    resolveAccountUrl?: (managedAccountKey?: string, identityId?: string) => string | undefined,
    resolveIdentityContext?: (identityId?: string) => { selectedIdentityName?: string; selectedIdentityUrl?: string }
): FusionReportDecision => {
    const account = decision.account || ({} as any)
    const sourceType =
        decision.sourceType ?? resolveSourceType?.(account.sourceName) ?? SourceType.Authoritative
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

    const managedAccountKey = account.id
    const selectedIdentityContext = resolveIdentityContext?.(decision.identityId) ?? {}
    const submitter = decision.submitter || ({} as any)
    const reviewerName =
        submitter.name || resolveReviewerName?.(submitter.id) || submitter.id
    const selectedIdentityName = decision.identityName || selectedIdentityContext.selectedIdentityName
    const correlatedIdentityContext = resolveIdentityContext?.(readString(decision, 'correlatedIdentityId')) ?? {}
    const correlatedAccountName = correlatedIdentityContext.selectedIdentityName
    const resolvedManagedAccountName = resolveAccountName?.(managedAccountKey)
    const accountNameFromDecision = trimStr(account.name)
    const accountName = correlatedAccountName
        || (accountNameFromDecision && accountNameFromDecision !== managedAccountKey ? accountNameFromDecision : undefined)
        || resolvedManagedAccountName
        || account.name
        || managedAccountKey

    const reviewerId = submitter.id
    const reviewerUrl = reviewerId && reviewerId !== 'system' ? resolveReviewerUrl?.(reviewerId) : undefined

    return {
        reviewerId,
        reviewerName,
        reviewerUrl,
        reviewerEmail: submitter.email || undefined,
        managedAccountKey,
        accountName,
        accountUrl: resolveAccountUrl?.(managedAccountKey, decision.identityId),
        accountSource: account.sourceName || '',
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

export class ReportService {
    public static readonly REPORT_DISK_SUBDIR = 'reports'
    public static readonly DRY_RUN_REPORT_TYPE = 'aggregation' as const
    public static readonly DRY_RUN_REPORT_TITLE = 'Identity Fusion Dry Run Report'
    public static readonly FUSION_REPORT_EMAIL_TITLE = 'Identity Fusion Report'
    private dryRunRuntimeOptions: DryRunRuntimeOptions = {}

    constructor(
        private baseurl: string,
        private log: LogService,
        private sources: SourceService,
        private identities: IdentityService,
        private forms: FormService,
        private fusion: FusionService,
        private email: EmailService,
        private run: FusionRun
    ) {}

    /** Configure operation-scoped dry-run report output behavior. */
    public setDryRunRuntimeOptions(runtimeOptions: DryRunRuntimeOptions): void {
        this.dryRunRuntimeOptions = { ...runtimeOptions }
    }

    /** Ensure the local report output directory exists and return its absolute path. */
    public async ensureReportOutputDirectoryExists(subdir: string = ReportService.REPORT_DISK_SUBDIR): Promise<string> {
        const dir = path.join(process.cwd(), subdir)
        await mkdir(dir, { recursive: true })
        return dir
    }

    /** Build fusion report HTML without sending (used by dry-run disk persistence and report delivery). */
    public renderFusionReportHtml(
        report: FusionReport,
        _reportType: 'aggregation' | 'fusion' = 'aggregation',
        reportTitleOverride?: string,
        locale?: string
    ): string {
        registerHandlebarsHelpers()
        const totalAccounts = report.totalAccounts ?? report.accounts.length
        const matchAccountCount = report.matches ?? report.accounts.filter((a) => a.matches.length > 0).length
        const reportTitle = reportTitleOverride || ReportService.FUSION_REPORT_EMAIL_TITLE
        const emailData: FusionReportEmailData = {
            ...report,
            totalAccounts,
            matches: matchAccountCount,
            reportDate: report.reportDate || new Date(),
            reportTitle,
            locale,
        }
        const templates = compileEmailTemplates()
        return renderFusionReport(templates, emailData)
    }

    /** Send report email to explicit recipients, independent from fusion account resolution. */
    public async sendReportTo(
        report: FusionReport,
        args: { recipients: string[]; reportType: 'aggregation' | 'fusion'; reportTitle?: string }
    ): Promise<void> {
        await this.deliverReportToRecipients(report, args)
    }

    /** Send report email to explicit recipients while fully owning sender readiness. */
    public async deliverReportToRecipients(
        report: FusionReport,
        args: { recipients: string[]; reportType: 'aggregation' | 'fusion'; reportTitle?: string }
    ): Promise<void> {
        const matchAccountCount = report.matches ?? report.accounts.filter((a) => a.matches.length > 0).length
        const reportTitle = args.reportTitle || ReportService.FUSION_REPORT_EMAIL_TITLE
        const subject = `${reportTitle} - ${matchAccountCount} Match(es) require(s) your attention`
        const body = this.renderFusionReportHtml(report, args.reportType, reportTitle)
        const validRecipients = sanitizeRecipients(args.recipients)

        if (validRecipients.length > 0 && typeof this.email?.sendEmail === 'function') {
            await this.email.sendEmail(validRecipients, subject, body)
            const sentRecipientCount = validRecipients.length
            this.log?.info?.(`Sent fusion report email to ${sentRecipientCount} recipient(s)`)
        }
    }

    /** Send report email to all global owners (source owner + governance group members). */
    public async sendReport(
        report: FusionReport,
        reportType: 'aggregation' | 'fusion'
    ): Promise<void> {
        const recipientEmails = new Set<string>()

        if (this.identities && this.sources) {
            const globalOwnerIds = await this.sources.fetchGlobalOwnerIdentityIds()
            if (globalOwnerIds.length > 0 && this.email?.getRecipientEmails) {
                const ownerEmails = await this.email.getRecipientEmails(globalOwnerIds)
                for (const e of ownerEmails) recipientEmails.add(e)
            }
        }

        if (recipientEmails.size === 0) {
            this.log?.warn?.('No recipient email found for report')
            return
        }

        const recipients = Array.from(recipientEmails)
        await this.deliverReportToRecipients(report, { recipients, reportType })
    }

    /**
     * Preload identities referenced by finished decisions so reviewer/identity metadata can be rendered in reports.
     */
    public async hydrateIdentitiesForReportDecisions(): Promise<void> {
        const finishedDecisions = this.forms?.finishedFusionDecisions ?? []
        const idsToHydrate = new Set<string>()
        for (const decision of finishedDecisions) {
            if (decision?.submitter?.id) idsToHydrate.add(decision.submitter.id)
            if (decision?.identityId) idsToHydrate.add(decision.identityId)
        }
        if (typeof (this.identities as any)?.hydrateMissingIdentitiesById === 'function') {
            await this.identities.hydrateMissingIdentitiesById([...idsToHydrate])
            return
        }
        // Backward-compatible path for legacy test doubles that only mock get/fetch by id.
        await Promise.all(
            [...idsToHydrate]
                .filter((id) => !this.identities?.getIdentityById?.(id))
                .map((id) => this.identities?.fetchIdentityById?.(id).catch(() => {}))
        )
    }

    /** Build normalized review-decision entries for report rendering. */
    public buildFusionReviewDecisions(): FusionReportDecision[] {
        const finishedDecisions = this.forms?.finishedFusionDecisions ?? []
        const urlContext = createUrlContext(this.baseurl)
        const resolveSourceType = (sourceName?: string): SourceType | undefined =>
            this.sources?.getSourceByNameSafe?.(sourceName)?.sourceType
        const resolveReviewerName = (reviewerId?: string): string | undefined => {
            if (!reviewerId) return undefined
            const reviewer = this.identities?.getIdentityById?.(reviewerId)
            return (
                (reviewer as any)?.displayName ||
                (reviewer as any)?.attributes?.displayName ||
                (reviewer as any)?.name ||
                undefined
            )
        }
        const resolveReviewerUrl = (reviewerId?: string): string | undefined =>
            reviewerId ? urlContext.identity(reviewerId) : undefined
        const resolveAccountName = (managedAccountKey?: string): string | undefined => {
            if (!managedAccountKey) return undefined
            const managedAccount = this.run?.managedAccountsAllById?.get(managedAccountKey)
            const name = trimStr(managedAccount?.name)
            return name && name !== managedAccountKey ? name : undefined
        }
        const resolveAccountUrl = (managedAccountKey?: string, identityId?: string): string | undefined => {
            if (!managedAccountKey) return undefined
            const reportAccountId = this.sources?.resolveIscAccountIdForManagedKey?.(managedAccountKey)
            if (reportAccountId) return urlContext.humanAccount(reportAccountId)
            const managedAccount = this.run?.managedAccountsAllById?.get(managedAccountKey)
            const directIscId = trimStr(managedAccount?.id)
            if (directIscId && directIscId !== managedAccountKey) {
                return urlContext.humanAccount(directIscId)
            }
            const fusionAccountByKey = this.fusion?.getFusionAccountByManagedKey?.(managedAccountKey)
            const fusionAccountByIdentity = identityId && typeof this.fusion?.getFusionIdentity === 'function' ? this.fusion.getFusionIdentity(identityId) : undefined
            let iscId = fusionAccountByKey?.iscAccountId ?? fusionAccountByIdentity?.iscAccountId
            if (!iscId && this.fusion?.fusionIdentities) {
                for (const fa of this.fusion.fusionIdentities) {
                    if (fa.managedKey === managedAccountKey && fa.iscAccountId) {
                        iscId = fa.iscAccountId
                        break
                    }
                }
            }
            if (iscId) {
                return urlContext.humanAccount(iscId)
            }
            return urlContext.humanAccount(managedAccountKey)
        }

        const resolveIdentityContext = (
            identityId?: string
        ): { selectedIdentityName?: string; selectedIdentityUrl?: string } => {
            if (!identityId) return {}
            const identity = this.identities?.getIdentityById?.(identityId)
            const selectedIdentityName =
                (identity as any)?.displayName ||
                (identity as any)?.attributes?.displayName ||
                (identity as any)?.name ||
                undefined
            const selectedIdentityUrl = urlContext.identity(identityId)
            return { selectedIdentityName, selectedIdentityUrl }
        }

        return finishedDecisions.map((decision) =>
            toReportDecision(
                decision,
                resolveSourceType,
                resolveReviewerName,
                resolveReviewerUrl,
                resolveAccountName,
                resolveAccountUrl,
                resolveIdentityContext
            )
        )
    }

    /**
     * Build aggregated statistics payload for dry-run report output.
     */
    public buildDryRunStats(aggregationStats: AggregationStats): DryRunStats {
        return {
            ...aggregationStats,
            ...this.buildFusionReportStats(aggregationStats),
        }
    }

    /** Build email-renderable report payload from internal FusionReport. */
    public buildEmailReportFromFusionReport(report: FusionReport, statsForRender: AggregationStats): FusionReport {
        return {
            ...report,
            accounts: report.accounts || [],
            matches: report.matches ?? 0,
            stats: statsForRender as any,
        }
    }

    /** Helper for writing and sending dry-run reports. */
    public async writeAndSendDryRunReport(args: {
        report: FusionReport
        finalDryRunStats: AggregationStats
        reportPhaseStartedAt?: number
    }): Promise<{ reportHtmlOutputPath?: string; statsWithPhaseTiming: AggregationStats }> {
        const { report, finalDryRunStats, reportPhaseStartedAt } = args
        const runtimeOptions = this.dryRunRuntimeOptions
        const shouldWriteHtmlReport = runtimeOptions.writeToDisk ?? true
        const shouldSendReportEmail = Array.isArray(runtimeOptions.sendReportTo) && runtimeOptions.sendReportTo.length > 0

        const reportElapsedMs =
            typeof reportPhaseStartedAt === 'number' ? Math.max(0, Date.now() - reportPhaseStartedAt) : 0

        const baseTiming = finalDryRunStats.phaseTiming ?? []
        const statsForRender: AggregationStats = {
            ...finalDryRunStats,
            phaseTiming:
                typeof reportPhaseStartedAt === 'number'
                    ? [...baseTiming, { phase: 'Report', elapsed: PhaseTimer.formatElapsed(reportElapsedMs) }]
                    : baseTiming,
        }

        const emailReport = this.buildEmailReportFromFusionReport(report, statsForRender)
        const htmlReportBody = this.renderFusionReportHtml(
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
            this.log?.info?.(`dry-run wrote HTML report to ${htmlPath}`)
        }

        if (shouldSendReportEmail) {
            await this.deliverReportToRecipients(emailReport, {
                recipients: runtimeOptions.sendReportTo ?? [],
                reportType: ReportService.DRY_RUN_REPORT_TYPE,
                reportTitle: ReportService.DRY_RUN_REPORT_TITLE,
            })
        }

        return { reportHtmlOutputPath, statsWithPhaseTiming: statsForRender }
    }

    /** Initialize report for dry-run row streaming. */
    public initializeDryRunReport(args: {
        fetchResult?: any
        totalProcessingTime?: string
        phaseTiming?: any
        includeNonMatches?: boolean
    }): { report: FusionReport; stats: AggregationStats } {
        const stats: AggregationStats = {
            identitiesFound: args.fetchResult?.stats?.identitiesFound ?? 0,
            managedAccountsFound: args.fetchResult?.stats?.totalManagedAccountsProcessed ?? 0,
            totalProcessingTime: args.totalProcessingTime ?? '0s',
            phaseTiming: args.phaseTiming,
        }
        const tracker = this.fusion.tracker
        const report = this.fusion.generateReport(tracker, args.includeNonMatches ?? true, stats)
        return { report, stats }
    }

    /** Finalize and output dry-run report. */
    public async finalizeDryRunReport(args: {
        report: FusionReport
        fetchResult?: any
        totalProcessingTime?: string
        phaseBreakdownThroughOutput?: any
    }): Promise<{ reportHtmlOutputPath?: string }> {
        const finalDryRunStats: AggregationStats = {
            identitiesFound: args.fetchResult?.stats?.identitiesFound ?? 0,
            managedAccountsFound: args.fetchResult?.stats?.totalManagedAccountsProcessed ?? 0,
            totalProcessingTime: args.totalProcessingTime ?? '0s',
            phaseTiming: args.phaseBreakdownThroughOutput,
        }
        const { reportHtmlOutputPath } = await this.writeAndSendDryRunReport({
            report: args.report,
            finalDryRunStats
        })
        return { reportHtmlOutputPath }
    }

    /**
     * Generate dry-run report output files (JSON + optionally HTML) and optionally send email.
     */
    public async generateDryRunReport(args: {
        aggregationStats: AggregationStats
        reportPhaseStartedAt?: number
        writeToDiskOverride?: boolean
    }): Promise<{ reportHtmlOutputPath?: string; statsWithPhaseTiming: AggregationStats }> {
        const { aggregationStats, reportPhaseStartedAt, writeToDiskOverride } = args
        const runtimeOptions = this.dryRunRuntimeOptions
        const shouldWriteHtmlReport = writeToDiskOverride ?? runtimeOptions.writeToDisk ?? true
        const shouldSendReportEmail = Array.isArray(runtimeOptions.sendReportTo) && runtimeOptions.sendReportTo.length > 0

        const reportElapsedMs =
            typeof reportPhaseStartedAt === 'number' ? Math.max(0, Date.now() - reportPhaseStartedAt) : 0

        const finalDryRunStats = this.buildDryRunStats(aggregationStats)

        await this.hydrateIdentitiesForReportDecisions()

        const report = this.fusion.generateReport(this.fusion.tracker, true, finalDryRunStats as any)
        report.fusionReviewDecisions = this.buildFusionReviewDecisions()

        const baseTiming = finalDryRunStats.phaseTiming ?? []
        const statsForRender: AggregationStats = {
            ...finalDryRunStats,
            phaseTiming:
                typeof reportPhaseStartedAt === 'number'
                    ? [...baseTiming, { phase: 'Report', elapsed: PhaseTimer.formatElapsed(reportElapsedMs) }]
                    : baseTiming,
        }

        if (typeof reportPhaseStartedAt === 'number') {
            this.log?.info?.(`PHASE 7: Report — HTML/email and stats (${PhaseTimer.formatElapsed(reportElapsedMs)})`)
        }

        const emailReport = this.buildEmailReportFromFusionReport(report, statsForRender)
        const htmlReportBody = this.renderFusionReportHtml(
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
            this.log?.info?.(`dry-run wrote HTML report to ${htmlPath}`)
        }

        if (shouldSendReportEmail) {
            await this.deliverReportToRecipients(emailReport, {
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
        includeNonMatches: boolean,
        aggregationStats?: AggregationStats
    ): Promise<void> {
        await this.hydrateIdentitiesForReportDecisions()

        if (aggregationStats) {
            const reportPhaseTimer = this.log.timer()
            const stats = this.buildFusionReportStats(aggregationStats)
            const tracker = this.fusion.tracker
            const report = this.fusion.generateReport(tracker, includeNonMatches, stats)
            report.fusionReviewDecisions = this.buildFusionReviewDecisions()
            reportPhaseTimer.phase('PHASE 7: Report (fusion report)', 'info', 'Report')
            const priorPhases = aggregationStats.phaseTiming ?? []
            stats.phaseTiming = [...priorPhases, ...reportPhaseTimer.getPhaseBreakdown()]
            report.stats = stats
            await this.sendReport(report, 'aggregation')
            return
        }

        const tracker = this.fusion.tracker
        const report = this.fusion.generateReport(tracker, includeNonMatches, undefined)
        report.fusionReviewDecisions = this.buildFusionReviewDecisions()
        await this.sendReport(report, 'fusion')
        this.identities.clear()
    }

    /** Build normalized FusionReportStats structure from AggregationStats. */
    private buildFusionReportStats(aggregationStats: AggregationStats): FusionReportStats {
        const finishedDecisions = this.forms?.finishedFusionDecisions ?? []
        const decisionSourceType = (d: { sourceType?: SourceType }): SourceType =>
            d.sourceType ?? SourceType.Authoritative
        const decisionCountByType = { authoritative: 0, record: 0, orphan: 0 }
        let authoritativeNewIdentities = 0
        let recordNoMatches = 0
        let orphanNoMatches = 0
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
        }

        const managedAccountsFoundAuthoritative = aggregationStats.managedAccountsFoundAuthoritative ?? 0
        const managedAccountsFoundRecord = aggregationStats.managedAccountsFoundRecord ?? 0
        const managedAccountsFoundOrphan = aggregationStats.managedAccountsFoundOrphan ?? 0
        const managedAccountsFound =
            managedAccountsFoundAuthoritative + managedAccountsFoundRecord + managedAccountsFoundOrphan

        const totalFusionAccounts = this.run?.totalFusionAccountCount ?? 0

        const warningSamples: string[] = []
        const errorSamples: string[] = []

        return {
            totalFusionAccounts,
            fusionAccountsFound: this.sources?.fusionAccountCount ?? 0,
            fusionReviewsCreated: this.forms?.formsCreated ?? 0,
            fusionReviewAssignments: this.forms?.formInstancesCreated ?? 0,
            fusionReviewsFound: this.forms?.formsFound ?? 0,
            fusionReviewInstancesFound: this.forms?.formInstancesFound ?? 0,
            fusionReviewsProcessed: this.forms?.answeredFormInstancesProcessed ?? 0,
            fusionReviewNewIdentities: authoritativeNewIdentities,
            fusionReviewNonMatches: recordNoMatches + orphanNoMatches,
            fusionReviewDecisionsAuthoritative: decisionCountByType.authoritative,
            fusionReviewDecisionsRecord: decisionCountByType.record,
            fusionReviewDecisionsOrphan: decisionCountByType.orphan,
            fusionReviewNewIdentitiesAuthoritative: authoritativeNewIdentities,
            fusionReviewNoMatchesRecord: recordNoMatches,
            fusionReviewNoMatchesOrphan: orphanNoMatches,
            aggregationWarnings: warningSamples.length,
            aggregationErrors: errorSamples.length,
            warningSamples,
            errorSamples,
            usedMemory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
            identitiesFound: aggregationStats.identitiesFound ?? 0,
            managedAccountsFound: managedAccountsFound || (aggregationStats.managedAccountsFound ?? 0),
            managedAccountsFoundAuthoritative,
            managedAccountsFoundRecord,
            managedAccountsFoundOrphan,
            phaseTiming: aggregationStats.phaseTiming,
            totalProcessingTime: aggregationStats.totalProcessingTime,
        }
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
