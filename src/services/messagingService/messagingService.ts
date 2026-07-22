import { FusionConfig } from '../../model/config'
import { ClientService } from '../clientService'
import { LogService } from '../logService'
import { IdentityService } from '../identityService'
import { SourceService } from '../sourceService'
import { WorkflowService } from '../workflowService'
import { EmailRenderer } from './emailRenderer'
import { renderFusionReport, FusionReportEmailData } from './helpers'
import { sanitizeRecipients } from './email'

export class MessagingService extends EmailRenderer {
    public static readonly FUSION_REPORT_EMAIL_TITLE = 'Identity Fusion Report'

    constructor(
        config: FusionConfig,
        log: LogService,
        client: ClientService,
        sources: SourceService,
        identities?: IdentityService,
        workflows?: WorkflowService
    ) {
        const activeWorkflows = workflows ?? new WorkflowService(config, log, client, sources)
        super(config, log, client, sources, identities, activeWorkflows)
    }

    /**
     * Delegate workflow prefetch to WorkflowService.
     */
    public async fetchSender(): Promise<void> {
        return this.workflows!.fetchSender()
    }

    /**
     * Delegate delayed aggregation prefetch to WorkflowService.
     */
    public async fetchDelayedAggregationSender(): Promise<void> {
        return this.workflows!.fetchDelayedAggregationSender()
    }

    /**
     * Delegate delayed aggregation scheduling to WorkflowService.
     */
    public async scheduleDelayedAggregation(args: {
        sourceId: string
        delayMinutes: number
        disableOptimization: boolean
    }): Promise<void> {
        return this.workflows!.scheduleDelayedAggregation(args)
    }

    /**
     * Delegate workflow access to WorkflowService.
     */
    public async getWorkflow(): Promise<any> {
        return this.workflows!.getWorkflow()
    }

    /**
     * Delegate delayed workflow access to WorkflowService.
     */
    public async getDelayedAggregationWorkflow(): Promise<any> {
        return this.workflows!.getDelayedAggregationWorkflow()
    }

    /**
     * Render HTML report (compatibility helper).
     */
    public renderFusionReportHtml(
        report: any,
        _reportType: 'aggregation' | 'fusion' = 'aggregation',
        reportTitleOverride?: string,
        locale?: string
    ): string {
        const totalAccounts = report.totalAccounts ?? report.accounts?.length ?? 0
        const matchAccountCount = report.matches ?? (report.accounts ? report.accounts.filter((a: any) => a.matches?.length > 0).length : 0)
        const reportTitle = reportTitleOverride || MessagingService.FUSION_REPORT_EMAIL_TITLE
        const emailData: FusionReportEmailData = {
            ...report,
            totalAccounts,
            matches: matchAccountCount,
            reportDate: report.reportDate || new Date(),
            reportTitle,
            headerSubtitle: this.buildEmailHeaderSubtitle(),
            locale,
        }
        return renderFusionReport(this.templates, emailData)
    }

    /**
     * Deliver report to recipients (compatibility helper).
     */
    public async deliverReportToRecipients(
        report: any,
        args: { recipients: string[]; reportType: 'aggregation' | 'fusion'; reportTitle?: string }
    ): Promise<void> {
        const matchAccountCount = report.matches ?? (report.accounts ? report.accounts.filter((a: any) => a.matches?.length > 0).length : 0)
        const reportTitle = args.reportTitle || MessagingService.FUSION_REPORT_EMAIL_TITLE
        const subject = `${reportTitle} - ${matchAccountCount} Match(es) require(s) your attention`
        const body = this.renderFusionReportHtml(report, args.reportType, reportTitle)
        await this.sendEmail(args.recipients, subject, body)
        const sentRecipientCount = sanitizeRecipients(args.recipients).length
        this.log.info(`Sent fusion report email to ${sentRecipientCount} recipient(s)`)
    }

    /**
     * Send report to recipients (compatibility helper).
     */
    public async sendReportTo(
        report: any,
        args: { recipients: string[]; reportType: 'aggregation' | 'fusion'; reportTitle?: string }
    ): Promise<void> {
        await this.deliverReportToRecipients(report, args)
    }

    /**
     * Send report (compatibility helper).
     */
    public async sendReport(report: any, reportType: 'aggregation' | 'fusion'): Promise<void> {
        const recipientEmails = new Set<string>()
        if (this.identities) {
            const globalOwnerIds = await this.sources.fetchGlobalOwnerIdentityIds()
            if (globalOwnerIds.length > 0) {
                const ownerEmails = await this.getRecipientEmails(globalOwnerIds)
                for (const e of ownerEmails) recipientEmails.add(e)
            }
        }
        if (recipientEmails.size === 0) {
            this.log.warn('No recipient email found for report')
            return
        }
        const recipients = Array.from(recipientEmails)
        await this.deliverReportToRecipients(report, { recipients, reportType })
    }
}
