import { SourceType } from '../model/config'
import { FusionDecision } from '../model/form'
import { resolveIdentityDocumentDisplayName } from '../model/fusionAccountUtils'
import { readString, trimStr } from '../utils/safeRead'
import { createUrlContext } from '../utils/url'
import { PhaseTimer } from './logService'
import { mkdir, writeFile } from 'fs/promises'
import * as path from 'path'
import type { FusionService } from './fusionService'
import { AggregationTracker as _AggregationTracker } from './fusionService/aggregationTracker'
import { promiseAllBatched } from './fusionService/collections'
import { resolveManagedAccountIscIdForReport } from './fusionService/reportAccountResolver'
import type { AggregationStats, FusionReport, FusionReportDecision, FusionReportStats } from './fusionService/types'
import type { FormService } from './formService'
import type { IdentityService } from './identityService'
import type { LogService } from './logService'
import type { EmailService } from './emailService'
import type { SourceService } from './sourceService'
import { FusionRun } from '../model/fusionRun'
import { assert } from '../utils/assert'
import { compileEmailTemplates, renderFusionReport, FusionReportEmailData } from './emailService/helpers'
import { registerHandlebarsHelpers } from './emailService/messagingHandlebarsRegistration'
import { sanitizeRecipients } from './emailService/email'
import { decisionLabelKey, translate, translateWithParams } from './emailService/localization'

type DryRunStats = AggregationStats & FusionReportStats

/** Fetch-phase counters passed from account-list orchestration into dry-run reports. */
type FetchResultLike = {
    identitiesFound?: number
    managedAccountsFound?: number
    managedAccountsFoundAuthoritative?: number
    managedAccountsFoundRecord?: number
    managedAccountsFoundOrphan?: number
}

const toReportDecision = (
    decision: FusionDecision,
    resolveSourceType?: (sourceName?: string) => SourceType | undefined,
    resolveReviewerName?: (reviewerId?: string) => string | undefined,
    resolveReviewerUrl?: (reviewerId?: string) => string | undefined,
    resolveAccountName?: (managedAccountKey?: string) => string | undefined,
    resolveAccountUrl?: (
        managedAccountKey?: string,
        identityId?: string,
        iscAccountId?: string
    ) => string | undefined,
    resolveIdentityContext?: (identityId?: string) => { selectedIdentityName?: string; selectedIdentityUrl?: string },
    locale?: string
): FusionReportDecision => {
    const account = decision.account || ({} as any)
    const sourceType =
        decision.sourceType ?? resolveSourceType?.(account.sourceName) ?? SourceType.Authoritative
    const isNoMatchSource = sourceType === SourceType.Record || sourceType === SourceType.Orphan
    const decisionType = decision.newIdentity
        ? isNoMatchSource
            ? 'confirm-no-match'
            : 'create-new-identity'
        : 'merge-existing-identity'

    const decisionLabel = translate(decisionLabelKey(decisionType), locale)

    const managedAccountKey = account.id
    const selectedIdentityContext = resolveIdentityContext?.(decision.identityId) ?? {}
    const submitter = decision.submitter || ({} as any)
    const reviewerId = submitter.id
    const submitterNameRaw = trimStr(submitter.name)
    const reviewerNameFromDecision =
        submitterNameRaw && submitterNameRaw !== reviewerId ? submitterNameRaw : undefined
    const resolvedReviewerName = resolveReviewerName?.(reviewerId)
    const reviewerName = reviewerNameFromDecision || resolvedReviewerName || reviewerId
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

    const reviewerUrl = reviewerId && reviewerId !== 'system' ? resolveReviewerUrl?.(reviewerId) : undefined

    return {
        reviewerId,
        reviewerName,
        reviewerUrl,
        reviewerEmail: submitter.email || undefined,
        managedAccountKey,
        accountName,
        accountUrl: resolveAccountUrl?.(managedAccountKey, decision.identityId, account.iscAccountId),
        accountSource: account.sourceName || '',
        sourceType,
        decision: decisionType,
        decisionLabel,
        selectedIdentityId: decision.identityId || undefined,
        selectedIdentityName,
        selectedIdentityUrl: selectedIdentityContext.selectedIdentityUrl,
        comments: decision.comments || undefined,
        formUrl: decision.formUrl || undefined,
        automaticMerge: decision.automaticMerge === true ? true : undefined,
    }
}

class FusionReviewDecisionResolver {
    private readonly urlContext: ReturnType<typeof createUrlContext>

    constructor(
        private readonly baseurl: string,
        private readonly sources: SourceService,
        private readonly identities: IdentityService,
        private readonly fusion: FusionService,
        private readonly run: FusionRun
    ) {
        this.urlContext = createUrlContext(baseurl)
    }

    resolveSourceType(sourceName?: string): SourceType | undefined {
        return this.sources?.getSourceByNameSafe?.(sourceName)?.sourceType
    }

    resolveReviewerName(reviewerId?: string): string | undefined {
        if (!reviewerId) return undefined
        return resolveIdentityDocumentDisplayName(this.identities?.getIdentityById?.(reviewerId))
    }

    resolveReviewerUrl(reviewerId?: string): string | undefined {
        return reviewerId ? this.urlContext.identity(reviewerId) : undefined
    }

    resolveAccountName(managedAccountKey?: string): string | undefined {
        if (!managedAccountKey) return undefined
        const info = this.run?.getManagedAccountInfo(managedAccountKey)
        const name = trimStr(info?.name)
        return name && name !== managedAccountKey ? name : undefined
    }

    resolveAccountUrl(managedAccountKey?: string, identityId?: string, iscAccountId?: string): string | undefined {
        const reportAccountId = this.resolveReportIscAccountId(managedAccountKey, identityId, iscAccountId)
        return reportAccountId ? this.urlContext.humanAccount(reportAccountId) : undefined
    }

    private resolveReportIscAccountId(
        managedAccountKey?: string,
        identityId?: string,
        iscAccountId?: string
    ): string | undefined {
        return resolveManagedAccountIscIdForReport(managedAccountKey, this.sources, this.run, {
            storedIscAccountId: iscAccountId,
            identityId,
        })
    }

    resolveIdentityContext(
        identityId?: string
    ): { selectedIdentityName?: string; selectedIdentityUrl?: string } {
        if (!identityId) return {}
        const identity = this.identities?.getIdentityById?.(identityId)
        const selectedIdentityName = resolveIdentityDocumentDisplayName(identity as any)
        return { selectedIdentityName, selectedIdentityUrl: this.urlContext.identity(identityId) }
    }
}


/** HTML/email product: aggregation report vs Fusion report (`report` action). */
export type FusionHtmlReportKind = 'aggregation' | 'fusion'

export class ReportService {
    public static readonly REPORT_DISK_SUBDIR = 'reports'
    public static readonly DRY_RUN_REPORT_TYPE = 'aggregation' as const
    /** Title for the dry-run report HTML/email (`Identity Fusion Dry Run Report`). */
    public static readonly DRY_RUN_REPORT_TITLE = 'Identity Fusion Dry Run Report'
    /** Title for the Fusion report HTML/email from the `report` action (`Identity Fusion Report`). */
    public static readonly FUSION_REPORT_EMAIL_TITLE = 'Identity Fusion Report'
    /** Title for the aggregation report HTML/email after persistent account-list (`Identity Fusion Aggregation Report`). */
    public static readonly AGGREGATION_REPORT_TITLE = 'Identity Fusion Aggregation Report'

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
        args: {
            recipients: string[]
            reportType: 'aggregation' | 'fusion'
            reportTitle?: string
            locale?: string
        }
    ): Promise<void> {
        const matchAccountCount = report.matches ?? report.accounts.filter((a) => a.matches.length > 0).length
        const locale = args.locale ?? this.email?.getDefaultEffectiveLocale?.() ?? 'en'
        const reportTitle =
            args.reportTitle ||
            (args.reportType === 'aggregation'
                ? translate('aggregation_report_title', locale)
                : translate('fusion_report_title', locale))
        const subject = translateWithParams('report_email_subject', locale, {
            reportTitle,
            matchCount: matchAccountCount,
        })
        const body = this.renderFusionReportHtml(report, args.reportType, reportTitle, locale)
        const validRecipients = sanitizeRecipients(args.recipients)

        if (validRecipients.length > 0 && typeof this.email?.sendEmail === 'function') {
            await this.email.sendEmail(validRecipients, subject, body, { locale })
            const sentRecipientCount = validRecipients.length
            this.log?.info?.(`Sent fusion report email to ${sentRecipientCount} recipient(s)`)
        }
    }

    /** Send report email to all global owners (source owner + governance group members). */
    public async sendReport(
        report: FusionReport,
        reportType: 'aggregation' | 'fusion',
        locale?: string
    ): Promise<void> {
        const recipientEmails = new Set<string>()
        let globalOwnerIds: string[] = []
        let ownerType: string | undefined

        if (this.identities && this.sources) {
            globalOwnerIds = await this.sources.fetchGlobalOwnerIdentityIds()
            try {
                ownerType = this.sources.fusionSourceOwner.type
            } catch {
                ownerType = undefined
            }
            if (globalOwnerIds.length > 0) {
                await this.hydrateIdentitiesById(globalOwnerIds)
                if (this.email?.getRecipientEmails) {
                    const ownerEmails = await this.email.getRecipientEmails(globalOwnerIds)
                    for (const e of ownerEmails) recipientEmails.add(e)
                }
            }
        }

        if (recipientEmails.size === 0) {
            this.log?.warn?.(
                `No recipient email found for report (ownerType=${ownerType ?? 'unknown'}, ownerIdentityIds=${globalOwnerIds.length})`
            )
            return
        }

        const recipients = Array.from(recipientEmails)
        const resolvedLocale =
            locale ??
            (globalOwnerIds[0] && this.email?.getRecipientLocale
                ? await this.email.getRecipientLocale(globalOwnerIds[0])
                : this.email?.getDefaultEffectiveLocale?.() ?? 'en')
        if (!report.fusionReviewDecisions?.length) {
            report.fusionReviewDecisions = this.buildFusionReviewDecisions(resolvedLocale)
        }
        await this.deliverReportToRecipients(report, { recipients, reportType, locale: resolvedLocale })
    }

    /**
     * Preload identities referenced by finished decisions so reviewer/identity metadata can be rendered in reports.
     */
    public async hydrateIdentitiesForReportDecisions(): Promise<void> {
        const finishedDecisions = this.forms?.finishedFusionDecisions ?? []
        const idsToHydrate = new Set<string>()
        for (const decision of finishedDecisions) {
            const submitterId = trimStr(decision?.submitter?.id)
            if (submitterId && submitterId !== 'system') idsToHydrate.add(submitterId)
            const identityId = trimStr(decision?.identityId)
            if (identityId) idsToHydrate.add(identityId)
            const correlatedIdentityId = trimStr(readString(decision, 'correlatedIdentityId'))
            if (correlatedIdentityId) idsToHydrate.add(correlatedIdentityId)
        }
        const identityIds = [...idsToHydrate]
        if (identityIds.length === 0 || !this.identities) return

        if (typeof (this.identities as IdentityService).ensureIdentityById === 'function') {
            await promiseAllBatched(identityIds, (id) => (this.identities as IdentityService).ensureIdentityById(id), 10)
            return
        }

        await this.hydrateIdentitiesById(identityIds)
    }

    /** Reload identity records needed for report email/metadata after earlier pipeline cache clears. */
    private async hydrateIdentitiesById(identityIds: string[]): Promise<void> {
        if (identityIds.length === 0 || !this.identities) return
        if (typeof (this.identities as any)?.hydrateMissingIdentitiesById === 'function') {
            await this.identities.hydrateMissingIdentitiesById(identityIds)
            return
        }
        // Backward-compatible path for legacy test doubles that only mock get/fetch by id.
        await Promise.all(
            identityIds
                .filter((id) => !this.identities?.getIdentityById?.(id))
                .map((id) => this.identities?.fetchIdentityById?.(id).catch(() => {}))
        )
    }

    /** Build normalized review-decision entries for report rendering. */
    public buildFusionReviewDecisions(locale?: string): FusionReportDecision[] {
        const finishedDecisions = this.forms?.finishedFusionDecisions ?? []
        const resolver = new FusionReviewDecisionResolver(
            this.baseurl,
            this.sources,
            this.identities,
            this.fusion,
            this.run
        )

        return finishedDecisions.map((decision) =>
            toReportDecision(
                decision,
                (sourceName) => resolver.resolveSourceType(sourceName),
                (reviewerId) => resolver.resolveReviewerName(reviewerId),
                (reviewerId) => resolver.resolveReviewerUrl(reviewerId),
                (managedAccountKey) => resolver.resolveAccountName(managedAccountKey),
                (managedAccountKey, identityId, iscAccountId) =>
                    resolver.resolveAccountUrl(managedAccountKey, identityId, iscAccountId),
                (identityId) => resolver.resolveIdentityContext(identityId),
                locale
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
        saveFile?: boolean
        sendEmail?: string | string[]
    }): Promise<{ reportHtmlOutputPath?: string; statsWithPhaseTiming: AggregationStats }> {
        const { report, finalDryRunStats, reportPhaseStartedAt, saveFile, sendEmail } = args
        const shouldWriteHtmlReport = saveFile ?? true
        const recipients = Array.isArray(sendEmail) ? sendEmail : (sendEmail ? [sendEmail] : [])
        const shouldSendReportEmail = recipients.length > 0

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

        const locale = this.email?.getDefaultEffectiveLocale?.() ?? 'en'
        report.fusionReviewDecisions = this.buildFusionReviewDecisions(locale)
        const emailReport = this.buildEmailReportFromFusionReport(report, statsForRender)
        const dryRunTitle = translate('dry_run_report_title', locale)
        const htmlReportBody = this.renderFusionReportHtml(
            emailReport,
            ReportService.DRY_RUN_REPORT_TYPE,
            dryRunTitle,
            locale
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
                recipients,
                reportType: ReportService.DRY_RUN_REPORT_TYPE,
                reportTitle: translate('dry_run_report_title', locale),
                locale,
            })
        }

        return { reportHtmlOutputPath, statsWithPhaseTiming: statsForRender }
    }

    /** Initialize report for dry-run row streaming. */
    public initializeDryRunReport(args: {
        fetchResult?: FetchResultLike
        totalProcessingTime?: string
        phaseTiming?: AggregationStats['phaseTiming']
    }): { report: FusionReport; stats: DryRunStats } {
        const stats = this.buildDryRunStats(this.aggregationStatsFromFetchResult(args))
        const tracker = this.requireTracker()
        const report = this.fusion.generateReport(tracker, false, stats)
        return { report, stats }
    }

    /** Finalize and output dry-run report. */
    public async finalizeDryRunReport(args: {
        report: FusionReport
        fetchResult?: FetchResultLike
        totalProcessingTime?: string
        phaseBreakdownThroughOutput?: AggregationStats['phaseTiming']
        saveFile?: boolean
        sendEmail?: string | string[]
    }): Promise<{ reportHtmlOutputPath?: string }> {
        const finalDryRunStats = this.buildDryRunStats(this.aggregationStatsFromFetchResult(args))
        const { reportHtmlOutputPath } = await this.writeAndSendDryRunReport({
            report: args.report,
            finalDryRunStats,
            saveFile: args.saveFile,
            sendEmail: args.sendEmail,
        })
        return { reportHtmlOutputPath }
    }

    /**
     * Generate dry-run report output files (JSON + optionally HTML) and optionally send email.
     */
    public async generateDryRunReport(args: {
        aggregationStats: AggregationStats
        reportPhaseStartedAt?: number
        saveFile?: boolean
        sendEmail?: string | string[]
    }): Promise<{ reportHtmlOutputPath?: string; statsWithPhaseTiming: AggregationStats }> {
        const { aggregationStats, reportPhaseStartedAt, saveFile, sendEmail } = args

        const reportElapsedMs =
            typeof reportPhaseStartedAt === 'number' ? Math.max(0, Date.now() - reportPhaseStartedAt) : 0

        const finalDryRunStats = this.buildDryRunStats(aggregationStats)

        await this.hydrateIdentitiesForReportDecisions()

        const report = this.fusion.generateReport(this.requireTracker(), false, finalDryRunStats as any)

        const baseTiming = finalDryRunStats.phaseTiming ?? []
        const statsForRender: AggregationStats = {
            ...finalDryRunStats,
            phaseTiming:
                typeof reportPhaseStartedAt === 'number'
                    ? [...baseTiming, { phase: 'Report', elapsed: PhaseTimer.formatElapsed(reportElapsedMs) }]
                    : baseTiming,
        }

        return this.writeAndSendDryRunReport({
            report,
            finalDryRunStats: statsForRender,
            reportPhaseStartedAt,
            saveFile,
            sendEmail,
        })
    }

    /**
     * Generate and send an aggregation report or Fusion report to global owners.
     *
     * @param reportKind - `'aggregation'` (post-aggregation epilogue) or `'fusion'` (`report` action)
     */
    public async generateAndSendFusionReport(
        includeNonMatches: boolean,
        aggregationStats?: AggregationStats,
        reportKind: FusionHtmlReportKind = 'aggregation'
    ): Promise<void> {
        await this.hydrateIdentitiesForReportDecisions()

        if (aggregationStats) {
            const reportPhaseTimer = this.log.timer()
            const reportStartedAt = Date.now()
            const stats = this.buildFusionReportStats(aggregationStats)
            const tracker = this.requireTracker()
            const report = this.fusion.generateReport(tracker, includeNonMatches, stats)
            const globalOwnerIds = await this.sources.fetchGlobalOwnerIdentityIds()
            const locale =
                globalOwnerIds[0] && this.email?.getRecipientLocale
                    ? await this.email.getRecipientLocale(globalOwnerIds[0])
                    : this.email?.getDefaultEffectiveLocale?.() ?? 'en'
            report.fusionReviewDecisions = this.buildFusionReviewDecisions(locale)
            reportPhaseTimer.recordElapsed('Report', Date.now() - reportStartedAt)
            const priorPhases = aggregationStats.phaseTiming ?? []
            stats.phaseTiming = [...priorPhases, ...reportPhaseTimer.getPhaseBreakdown()]
            report.stats = stats
            await this.sendReport(report, reportKind, locale)
            return
        }

        const tracker = this.requireTracker()
        const report = this.fusion.generateReport(tracker, includeNonMatches, undefined)
        const globalOwnerIds = await this.sources.fetchGlobalOwnerIdentityIds()
        const locale =
            globalOwnerIds[0] && this.email?.getRecipientLocale
                ? await this.email.getRecipientLocale(globalOwnerIds[0])
                : this.email?.getDefaultEffectiveLocale?.() ?? 'en'
        report.fusionReviewDecisions = this.buildFusionReviewDecisions(locale)
        await this.sendReport(report, reportKind, locale)
        this.identities.clear()
    }

    /** Builds aggregation report payload without sending (for local recording artifacts). */
    public async buildAggregationReportSnapshot(
        includeNonMatches: boolean,
        aggregationStats: AggregationStats
    ): Promise<Record<string, unknown>> {
        await this.hydrateIdentitiesForReportDecisions()
        const stats = this.buildFusionReportStats(aggregationStats)
        const tracker = this.requireTracker()
        const report = this.fusion.generateReport(tracker, includeNonMatches, stats)
        report.fusionReviewDecisions = this.buildFusionReviewDecisions(this.email?.getDefaultEffectiveLocale?.() ?? 'en')
        report.stats = stats
        return report as Record<string, unknown>
    }

    /** Map fetch-phase counters into AggregationStats for dry-run report rendering. */
    private aggregationStatsFromFetchResult(args: {
        fetchResult?: FetchResultLike
        totalProcessingTime?: string
        phaseTiming?: AggregationStats['phaseTiming']
        phaseBreakdownThroughOutput?: AggregationStats['phaseTiming']
    }): AggregationStats {
        const fetchResult = args.fetchResult
        return {
            identitiesFound: fetchResult?.identitiesFound ?? 0,
            managedAccountsFound: fetchResult?.managedAccountsFound ?? 0,
            managedAccountsFoundAuthoritative: fetchResult?.managedAccountsFoundAuthoritative,
            managedAccountsFoundRecord: fetchResult?.managedAccountsFoundRecord,
            managedAccountsFoundOrphan: fetchResult?.managedAccountsFoundOrphan,
            totalProcessingTime: args.totalProcessingTime ?? '0s',
            phaseTiming: args.phaseBreakdownThroughOutput ?? args.phaseTiming,
        }
    }

    private requireTracker(): _AggregationTracker {
        const tracker = this.run.getTracker()
        assert(tracker, 'AggregationTracker has not been set on FusionRun')
        return tracker
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

        const totalFusionAccounts =
            aggregationStats.fusionAccountsReturned ?? this.run?.totalFusionAccountCount ?? 0

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





