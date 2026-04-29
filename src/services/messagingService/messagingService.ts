import {
    FormInstanceResponseV2025,
    WorkflowV2025,
    TestWorkflowRequestV2025,
    WorkflowsV2025ApiTestWorkflowRequest,
    CreateWorkflowRequestV2025,
} from 'sailpoint-api-client'
import type { TemplateDelegate as HandlebarsTemplateDelegate } from 'handlebars'
import { FusionConfig, SourceType } from '../../model/config'
import { ClientService } from '../clientService'
import { LogService } from '../logService'
import { EmailWorkflow } from '../../model/emailWorkflow'
import { DelayedAggregationWorkflow } from '../../model/delayedAggregationWorkflow'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { assert, softAssert } from '../../utils/assert'
import { wrapConnectorError } from '../../utils/error'
import { pickAttributes } from '../../utils/attributes'
import { createUrlContext, getUIOriginFromBaseUrl, UrlContext } from '../../utils/url'
import { normalizeEmailValue, sanitizeRecipients } from './email'
import { IdentityService } from '../identityService'
import { SourceService } from '../sourceService'
import type { FusionAccount } from '../../model/account'
import { FusionReport } from '../fusionService/types'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { readString } from '../../utils/safeRead'
import {
    registerHandlebarsHelpers,
    compileEmailTemplates,
    renderFusionReviewEmail,
    renderFusionReport,
    type FusionReviewEmailData,
    type FusionReportEmailData,
} from './helpers'
import { mkdir } from 'fs/promises'
import * as path from 'path'

// ============================================================================
// MessagingService Class
// ============================================================================

/**
 * Service for sending emails to reviewers via workflows.
 * Handles workflow creation, email composition, and notification delivery.
 */
export class MessagingService {
    /** ISC: workflow definition + test input must stay under this combined size (bytes). */
    private static readonly WORKFLOW_COMBINED_LIMIT_BYTES = 1_500_000
    /**
     * Room for differences vs ISC's combined-size measurement (definition + input).
     * Client-side JSON.stringify(getWorkflow) can be tens of kilobytes smaller than the platform,
     * which previously allowed payloads that still failed with ~1.56MB reported totals.
     */
    private static readonly WORKFLOW_COMBINED_SAFETY_MARGIN_BYTES = 200_000
    /**
     * When getWorkflow fails, cap test `input` JSON this small so we do not assume the definition is tiny
     * (listWorkflows summaries are often incomplete; underestimating definition size caused oversized payloads).
     */
    private static readonly FALLBACK_MAX_TEST_INPUT_BYTES = 120_000
    private static readonly TRUNCATION_NOTICE_HTML =
        '<div style="margin-top:16px;padding:12px;border:1px solid #fde68a;border-left:6px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:12px;">Report content was truncated to fit ISC workflow input size limits.</div>'
    /** Email subject and template H1 for all fusion report sends (aggregation + explicit recipient paths). */
    private static readonly FUSION_REPORT_EMAIL_TITLE = 'Identity Fusion Report'
    private workflow: WorkflowV2025 | undefined
    private delayedAggregationWorkflow: WorkflowV2025 | undefined
    private templates: Map<string, HandlebarsTemplateDelegate> = new Map()
    private readonly workflowName: string
    private readonly delayedAggregationWorkflowName: string
    private readonly cloudDisplayName: string
    private readonly apiBaseUrl: string
    private readonly urlContext: UrlContext
    private readonly reportAttributes: string[]

    /** UTF-8 byte length of JSON-serialized workflow from getWorkflow; undefined if not measured yet or call failed. */
    private emailSenderWorkflowDefinitionBytes: number | undefined

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    constructor(
        config: FusionConfig,
        private log: LogService,
        private client: ClientService,
        private sources: SourceService,
        private identities?: IdentityService
    ) {
        this.workflowName = config.workflowName
        this.delayedAggregationWorkflowName = config.delayedAggregationWorkflowName
        this.cloudDisplayName = config.cloudDisplayName
        this.apiBaseUrl = config.baseurl.replace(/\/$/, '')
        this.reportAttributes = config.fusionFormAttributes ?? []
        this.urlContext = createUrlContext(config.baseurl)
        registerHandlebarsHelpers()
        this.templates = compileEmailTemplates()
    }

    /** Hostname from UI origin plus fusion source display name for email headers. */
    private buildEmailHeaderSubtitle(): string | undefined {
        let host: string | undefined
        try {
            const origin = getUIOriginFromBaseUrl(this.apiBaseUrl) ?? this.apiBaseUrl
            host = new URL(origin).hostname
        } catch {
            host = undefined
        }
        if (!host) {
            try {
                host = new URL(this.apiBaseUrl).hostname
            } catch {
                host = undefined
            }
        }
        if (!host) {
            return undefined
        }
        const sourceName = this.sources.getFusionSource()?.name ?? 'Fusion source'
        return `${host} - ${sourceName}`
    }

    // ------------------------------------------------------------------------
    // Public Methods
    // ------------------------------------------------------------------------

    /** Ensure a report output directory exists under the current working directory. */
    public async ensureReportOutputDirectoryExists(subdir: string = 'reports'): Promise<string> {
        const dir = path.join(process.cwd(), subdir)
        await mkdir(dir, { recursive: true })
        return dir
    }

    /**
     * Prepare the email sender workflow by checking for existence and creating if needed.
     * This should be called before sending any emails to ensure the workflow is ready.
     */
    public async fetchSender(): Promise<void> {
        if (this.workflow) {
            this.log.debug('Email workflow already prepared')
            return
        }

        assert(this.workflowName, 'Workflow name is required')
        assert(this.cloudDisplayName, 'Cloud display name is required')

        const workflowName = `${this.workflowName} (${this.cloudDisplayName})`
        this.log.debug(`Preparing email sender workflow: ${workflowName}`)

        const owner = this.sources.fusionSourceOwner
        assert(owner, 'Fusion source owner is required')
        assert(owner.id, 'Fusion source owner ID is required')

        // First, check if the workflow already exists
        const existingWorkflow = await this.findWorkflowByName(workflowName)
        if (existingWorkflow) {
            this.workflow = existingWorkflow
            this.log.info(`Found existing workflow: ${workflowName} (ID: ${this.workflow.id})`)

            // The Workflows v2025 test endpoint rejects enabled workflows (400).
            // We rely on testWorkflow for delivery in this connector, so keep it disabled.
            await this.disableWorkflowIfEnabled(this.workflow)
            await this.refreshEmailWorkflowDefinitionBytes()
            return
        }

        // Workflow doesn't exist, create it
        await wrapConnectorError(async () => {
            const emailWorkflow = new EmailWorkflow(workflowName, owner)
            assert(emailWorkflow, 'Failed to create email workflow object')

            // Ensure the workflow is disabled so we can call testWorkflow safely.
            ;(emailWorkflow as { enabled?: boolean }).enabled = false

            this.workflow = await this.createWorkflow(emailWorkflow)
            assert(this.workflow, 'Failed to create workflow')
            assert(this.workflow.id, 'Workflow ID is required')

            this.log.info(`Created workflow: ${workflowName} (ID: ${this.workflow.id})`)
            await this.refreshEmailWorkflowDefinitionBytes()
        }, `Workflow preparation failed. Unable to create email workflow "${workflowName}"`)
    }

    /**
     * Prepare the delayed aggregation workflow by checking for existence and creating if needed.
     */
    public async fetchDelayedAggregationSender(): Promise<void> {
        if (this.delayedAggregationWorkflow) {
            this.log.debug('Delayed aggregation workflow already prepared')
            return
        }

        assert(this.delayedAggregationWorkflowName, 'Delayed aggregation workflow name is required')
        assert(this.cloudDisplayName, 'Cloud display name is required')

        const workflowName = `${this.delayedAggregationWorkflowName} (${this.cloudDisplayName})`
        this.log.debug(`Preparing delayed aggregation workflow: ${workflowName}`)

        const owner = this.sources.fusionSourceOwner
        assert(owner, 'Fusion source owner is required')
        assert(owner.id, 'Fusion source owner ID is required')

        const existingWorkflow = await this.findWorkflowByName(workflowName)
        if (existingWorkflow) {
            this.delayedAggregationWorkflow = existingWorkflow
            this.log.info(
                `Found existing delayed aggregation workflow: ${workflowName} (ID: ${this.delayedAggregationWorkflow.id})`
            )
            await this.disableWorkflowIfEnabled(this.delayedAggregationWorkflow)
            return
        }

        await wrapConnectorError(async () => {
            const delayedWorkflow = new DelayedAggregationWorkflow(workflowName, owner, this.apiBaseUrl)
            assert(delayedWorkflow, 'Failed to create delayed aggregation workflow object')
            ;(delayedWorkflow as { enabled?: boolean }).enabled = false

            this.delayedAggregationWorkflow = await this.createWorkflow(delayedWorkflow)
            assert(this.delayedAggregationWorkflow, 'Failed to create delayed aggregation workflow')
            assert(this.delayedAggregationWorkflow.id, 'Delayed aggregation workflow ID is required')

            this.log.info(
                `Created delayed aggregation workflow: ${workflowName} (ID: ${this.delayedAggregationWorkflow.id})`
            )
        }, `Workflow preparation failed. Unable to create delayed aggregation workflow "${workflowName}"`)
    }

    /**
     * Schedule a delayed source aggregation in ISC workflows (fire-and-forget).
     */
    public async scheduleDelayedAggregation(args: {
        sourceId: string
        delayMinutes: number
        disableOptimization: boolean
    }): Promise<void> {
        assert(args.sourceId, 'Source ID is required to schedule delayed aggregation')

        const workflow = await this.getDelayedAggregationWorkflow()
        assert(workflow.id, 'Delayed aggregation workflow ID is required')

        const accessToken = await this.resolveAccessToken()
        assert(accessToken, 'Unable to resolve access token for delayed aggregation workflow')

        const safeDelayMinutes = Math.max(1, Math.trunc(args.delayMinutes || 1))
        const request: TestWorkflowRequestV2025 = {
            input: {
                delayMinutes: `${safeDelayMinutes}m`,
                sourceId: args.sourceId,
                disableOptimization: args.disableOptimization,
                accessToken,
            },
        }

        const requestParameters: WorkflowsV2025ApiTestWorkflowRequest = {
            id: workflow.id,
            testWorkflowRequestV2025: request,
        }

        try {
            const response = await this.testWorkflow(requestParameters)
            assert(response, 'Delayed workflow response is required')
            softAssert(
                response.status === 200,
                `Failed to schedule delayed aggregation workflow - received status ${response.status}`,
                'error'
            )
            this.log.info(
                `Scheduled delayed aggregation workflow for source ${args.sourceId} with delay ${safeDelayMinutes} minute(s)`
            )
        } catch (e) {
            this.log.error(
                `Failed to schedule delayed aggregation for source ${args.sourceId}: ${
                    e instanceof Error ? e.message : String(e)
                }`
            )
        }
    }

    /**
     * Send email notification for a fusion form (matching review)
     */
    public async sendFusionEmail(
        formInstance: FormInstanceResponseV2025,
        context?: {
            accountName: string
            accountSource: string
            sourceType?: SourceType
            accountId?: string
            accountEmail?: string
            accountAttributes: Record<string, any>
            candidates: Array<{ id: string; name: string; attributes: Record<string, any>; scores?: any[] }>
        }
    ): Promise<void> {
        assert(formInstance, 'Form instance is required')
        assert(formInstance.id, 'Form instance ID is required')

        const { formInput, recipients } = formInstance

        if (!recipients || recipients.length === 0) {
            this.log.warn(`No recipients found for form instance ${formInstance.id}`)
            return
        }

        const recipientId = recipients[0].id

        const recipientEmails = await this.getRecipientEmails([recipientId])
        if (recipientEmails.length === 0) {
            this.log.warn(`No valid email addresses found for form instance ${formInstance.id}`)
            return
        }

        const formInputName = readString(formInput, 'name')
        const formInputAccount = readString(formInput, 'account')
        const formInputSource = readString(formInput, 'source')
        const accountName = context?.accountName || String(formInputName || formInputAccount || 'Unknown Account')
        const accountSource = context?.accountSource || String(formInputSource || 'Unknown')
        const pickedAccountAttributes = pickAttributes(context?.accountAttributes, this.reportAttributes)
        const rawAccountId = context?.accountId || String(formInputAccount || '')
        const accountId =
            this.sources.resolveIscAccountIdForManagedKey(rawAccountId) ||
            rawAccountId
        const accountUrl = this.urlContext.humanAccount(accountId || undefined)
        const accountEmail = context?.accountEmail

        const candidates = context?.candidates ?? []

        const subject = `Identity Fusion Review Required: ${accountName} [${accountSource}]`
        const sourceTypeInput = readString(formInput, 'sourceType')
        const sourceType =
            context?.sourceType ??
            (sourceTypeInput === SourceType.Authoritative ||
            sourceTypeInput === SourceType.Record ||
            sourceTypeInput === SourceType.Orphan
                ? (sourceTypeInput as SourceType)
                : undefined)
        const emailData: FusionReviewEmailData = {
            headerSubtitle: this.buildEmailHeaderSubtitle(),
            accounts: [
                {
                    accountName,
                    accountSource,
                    sourceType,
                    accountId: accountId || undefined,
                    accountUrl,
                    accountEmail,
                    accountAttributes: pickedAccountAttributes,
                    matches: candidates.map((candidate: any) => ({
                        identityName: candidate.name || 'Unknown',
                        identityId: candidate.id || undefined,
                        identityUrl: this.urlContext.identity(candidate.id),
                        isMatch: true,
                        exact: isExactAttributeMatchScores(candidate.scores),
                        scores: (candidate.scores || []).map((s: any) => ({
                            attribute: s.attribute,
                            algorithm: s.algorithm,
                            score: s.score,
                            weightedScore: s.weightedScore,
                            fusionScore: s.fusionScore,
                            isMatch: s.isMatch,
                            skipped: s.skipped,
                            comment: s.comment,
                        })),
                    })),
                },
            ],
            totalAccounts: 1,
            matches: 1,
            reportDate: new Date(),
            formInstanceId: formInstance.id,
            formUrl: formInstance.standAloneFormUrl,
        }

        assert(this.templates, 'Email templates are required')
        const body = renderFusionReviewEmail(this.templates, emailData)
        assert(body, 'Failed to render fusion review email body')

        await this.sendEmail(recipientEmails, subject, body)
        this.log.info(`Sent fusion email to ${recipientEmails.length} recipient(s) for form ${formInstance.id}`)
    }

    /**
     * Send report email for accounts with matches
     */
    public async sendReport(
        report: FusionReport,
        fusionAccount: FusionAccount | undefined,
        reportType: 'aggregation' | 'fusion'
    ): Promise<void> {
        // Recipients:
        // - the initiating fusion account (if we can resolve an email)
        // - the fusion source owner (always)
        const recipientEmails = new Set<string>()

        if (fusionAccount?.email) {
            recipientEmails.add(fusionAccount.email)
        } else if (fusionAccount && this.identities && fusionAccount.identityId) {
            // Try to get email from identity (only if identityId exists)
            const identity = this.identities.getIdentityById(fusionAccount.identityId)
            if (identity?.attributes?.email) {
                recipientEmails.add(identity.attributes.email)
            }
        }

        // Add all global owners (source owner + governance group members) as recipients
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

    /** Build fusion report HTML without sending (used by dry-run disk persistence). */
    public renderFusionReportHtml(
        report: FusionReport,
        _reportType: 'aggregation' | 'fusion',
        reportTitleOverride?: string
    ): string {
        const totalAccounts = report.totalAccounts ?? report.accounts.length
        const matchAccountCount = report.matches ?? report.accounts.filter((a) => a.matches.length > 0).length
        const reportTitle = reportTitleOverride || MessagingService.FUSION_REPORT_EMAIL_TITLE
        const emailData: FusionReportEmailData = {
            ...report,
            totalAccounts,
            matches: matchAccountCount,
            reportDate: report.reportDate || new Date(),
            reportTitle,
            headerSubtitle: this.buildEmailHeaderSubtitle(),
        }
        return renderFusionReport(this.templates, emailData)
    }

    /** Send report email to explicit recipients, independent from fusion account resolution. */
    public async sendReportTo(
        report: FusionReport,
        args: { recipients: string[]; reportType: 'aggregation' | 'fusion'; reportTitle?: string }
    ): Promise<void> {
        await this.deliverReportToRecipients(report, args)
    }

    /**
     * Send report email to explicit recipients while fully owning sender readiness.
     */
    public async deliverReportToRecipients(
        report: FusionReport,
        args: { recipients: string[]; reportType: 'aggregation' | 'fusion'; reportTitle?: string }
    ): Promise<void> {
        const matchAccountCount = report.matches ?? report.accounts.filter((a) => a.matches.length > 0).length
        const reportTitle = args.reportTitle || MessagingService.FUSION_REPORT_EMAIL_TITLE
        const subject = `${reportTitle} - ${matchAccountCount} Match(es) require(s) your attention`
        const body = this.renderFusionReportHtml(report, args.reportType, reportTitle)
        await this.sendEmail(args.recipients, subject, body)
        const sentRecipientCount = sanitizeRecipients(args.recipients).length
        this.log.info(`Sent fusion report email to ${sentRecipientCount} recipient(s)`)
    }

    // ------------------------------------------------------------------------
    // Private Helper Methods
    // ------------------------------------------------------------------------

    /**
     * Get the workflow, ensuring it's prepared first
     */
    private async getWorkflow(): Promise<WorkflowV2025> {
        if (!this.workflow) {
            await this.fetchSender()
        }
        if (!this.workflow) {
            throw new ConnectorError(
                'Email workflow not available. The email sender workflow could not be prepared. Check workflow configuration.',
                ConnectorErrorType.Generic
            )
        }
        return this.workflow
    }

    /**
     * Get the delayed aggregation workflow, ensuring it's prepared first.
     */
    private async getDelayedAggregationWorkflow(): Promise<WorkflowV2025> {
        if (!this.delayedAggregationWorkflow) {
            await this.fetchDelayedAggregationSender()
        }
        if (!this.delayedAggregationWorkflow) {
            throw new ConnectorError(
                'Delayed aggregation workflow not available. The workflow could not be prepared.',
                ConnectorErrorType.Generic
            )
        }
        return this.delayedAggregationWorkflow
    }

    /**
     * Send an email using the workflow
     */
    private async sendEmail(recipients: string[], subject: string, body: string): Promise<void> {
        assert(recipients, 'Recipients array is required')
        const sanitizedRecipientList = sanitizeRecipients(recipients)
        assert(sanitizedRecipientList.length > 0, 'At least one recipient is required')
        assert(subject, 'Email subject is required')
        assert(body, 'Email body is required')

        const workflow = await this.getWorkflow()
        assert(workflow, 'Workflow is required')
        assert(workflow.id, 'Workflow ID is required')

        const maxTestInputBytes = this.getMaxTestWorkflowInputBytes()
        if (this.emailSenderWorkflowDefinitionBytes !== undefined) {
            const headroom =
                MessagingService.WORKFLOW_COMBINED_LIMIT_BYTES -
                MessagingService.WORKFLOW_COMBINED_SAFETY_MARGIN_BYTES -
                this.emailSenderWorkflowDefinitionBytes
            if (headroom < 4096) {
                this.log.error(
                    `Email workflow definition is ~${this.emailSenderWorkflowDefinitionBytes} bytes; combined limit (${MessagingService.WORKFLOW_COMBINED_LIMIT_BYTES}) leaves almost no room for report body. Shrink the email sender workflow in ISC or simplify its steps.`
                )
            }
        }
        let safeBody = this.fitEmailBodyToWorkflowLimit(subject, sanitizedRecipientList, body, maxTestInputBytes)
        if (!safeBody) {
            safeBody =
                '<p>Identity Fusion: report body omitted because it exceeds the ISC combined workflow size limit.</p>'
        }
        const testRequest: TestWorkflowRequestV2025 = {
            input: {
                subject,
                body: safeBody,
                recipients: sanitizedRecipientList,
            },
        }
        const requestParameters: WorkflowsV2025ApiTestWorkflowRequest = {
            id: workflow.id,
            testWorkflowRequestV2025: testRequest,
        }

        this.log.debug(`Sending email to ${sanitizedRecipientList.length} recipient(s) via workflow ${workflow.id}`)
        try {
            const response = await this.testWorkflow(requestParameters)
            assert(response, 'Workflow response is required')
            softAssert(response.status === 200, `Failed to send email - received status ${response.status}`, 'error')
        } catch (e) {
            // Never crash aggregation because email delivery failed.
            this.log.error(`Failed to execute email workflow ${workflow.id}: ${e}`)
        }
    }

    /**
     * Measure UTF-8 bytes for the test-workflow input payload shape used by ISC.
     */
    private workflowInputByteLength(subject: string, body: string, recipients: string[]): number {
        return Buffer.byteLength(JSON.stringify({ input: { subject, body, recipients } }), 'utf8')
    }

    /**
     * Max UTF-8 bytes for JSON.stringify({ input: { subject, body, recipients } }) so that
     * definition + input stays under ISC combined limit.
     */
    private getMaxTestWorkflowInputBytes(): number {
        const limit = MessagingService.WORKFLOW_COMBINED_LIMIT_BYTES
        const margin = MessagingService.WORKFLOW_COMBINED_SAFETY_MARGIN_BYTES
        if (this.emailSenderWorkflowDefinitionBytes === undefined) {
            return MessagingService.FALLBACK_MAX_TEST_INPUT_BYTES
        }
        return Math.max(1024, limit - margin - this.emailSenderWorkflowDefinitionBytes)
    }

    /**
     * Measure full workflow JSON via getWorkflow (listWorkflows entries are often incomplete).
     */
    private async refreshEmailWorkflowDefinitionBytes(): Promise<void> {
        if (!this.workflow?.id) {
            return
        }
        const workflowId = this.workflow.id
        const getWorkflowFn = async () => {
            const response = await this.client.workflowsApi.getWorkflow({ id: workflowId })
            return response.data
        }
        const full = await this.client.execute(
            getWorkflowFn,
            undefined,
            'MessagingService>refreshEmailWorkflowDefinitionBytes'
        )
        if (full !== undefined && full !== null) {
            this.emailSenderWorkflowDefinitionBytes = Buffer.byteLength(JSON.stringify(full), 'utf8')
            this.log.debug(
                `Email workflow definition JSON ~${this.emailSenderWorkflowDefinitionBytes} bytes; max test input ~${this.getMaxTestWorkflowInputBytes()} bytes`
            )
        } else {
            this.emailSenderWorkflowDefinitionBytes = undefined
            this.log.warn(
                `Could not load workflow ${workflowId} to measure definition size; capping test input at ${MessagingService.FALLBACK_MAX_TEST_INPUT_BYTES} bytes`
            )
        }
    }

    /**
     * Trim rendered HTML report content to keep workflow test input under size limits.
     * Uses binary search to preserve the largest prefix and append a truncation notice.
     */
    private fitEmailBodyToWorkflowLimit(
        subject: string,
        recipients: string[],
        body: string,
        maxSerializedInputBytes: number
    ): string {
        if (this.workflowInputByteLength(subject, body, recipients) <= maxSerializedInputBytes) {
            return body
        }

        const notice = MessagingService.TRUNCATION_NOTICE_HTML

        let low = 0
        let high = body.length
        let best = ''
        // Binary-search the largest prefix that still fits once the truncation notice is appended.
        // This avoids repeated full-template regeneration while maximizing retained report content.
        while (low <= high) {
            const mid = Math.floor((low + high) / 2)
            const candidate = `${body.slice(0, mid)}${notice}`
            if (this.workflowInputByteLength(subject, candidate, recipients) <= maxSerializedInputBytes) {
                best = candidate
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        if (!best) {
            const fallback = notice
            if (this.workflowInputByteLength(subject, fallback, recipients) <= maxSerializedInputBytes) {
                this.log.warn('Email body exceeded workflow payload limit; sent truncation notice only')
                return fallback
            }
            this.log.warn('Email payload exceeds workflow limit after aggressive truncation')
            return ''
        }

        this.log.warn('Email body exceeded workflow payload limit; content truncated before send')
        return best
    }

    /**
     * Get email addresses for recipient identity IDs
     */
    private async getRecipientEmails(identityIds: (string | undefined)[]): Promise<string[]> {
        const emails = new Set<string>()

        for (const identityId of identityIds) {
            if (!identityId) {
                continue
            }

            if (!this.identities) {
                this.log.warn('IdentityService not available, cannot fetch recipient emails')
                continue
            }

            let identity = this.identities.getIdentityById(identityId)
            if (!identity) {
                try {
                    identity = await this.identities.fetchIdentityById(identityId)
                } catch (e) {
                    this.log.warn(`Failed to fetch identity ${identityId}: ${e}`)
                }
            }

            const attrs: any = identity?.attributes ?? {}
            const emailValue = attrs.email ?? attrs.mail ?? attrs.emailAddress
            const normalized = normalizeEmailValue(emailValue)

            if (normalized.length > 0) {
                normalized.forEach((e) => emails.add(e))
            } else {
                this.log.warn(`No email found for identity ${identityId}`)
            }
        }

        return Array.from(emails)
    }

    /**
     * Disable workflow when enabled to allow testWorkflow execution.
     */
    private async disableWorkflowIfEnabled(workflow: WorkflowV2025): Promise<void> {
        try {
            const enabled = (workflow as any)?.enabled
            if (enabled === false) return
            if (!workflow.id) return

            const { workflowsApi } = this.client
            const patchFnAny: any = (workflowsApi as any)?.patchWorkflow
            if (typeof patchFnAny !== 'function') {
                this.log.debug(`patchWorkflow not available in SDK; cannot disable workflow ${workflow.id}`)
                return
            }

            const requestParameters: any = {
                id: workflow.id,
                jsonPatchOperationV2025: [{ op: 'replace', path: '/enabled', value: false }],
            }

            const patchCall = async () => {
                const resp = await patchFnAny.call(workflowsApi, requestParameters)
                return (resp as any)?.data ?? resp
            }

            await this.client.execute(patchCall)
            this.log.info(`Disabled workflow ${workflow.id} to allow test execution`)
        } catch (e) {
            // If we can't disable it, testWorkflow may fail with 400.
            this.log.warn(`Failed to disable workflow ${workflow.id}: ${e}`)
        }
    }

    /**
     * Resolve the current bearer token used by the API client.
     */
    private async resolveAccessToken(): Promise<string> {
        const accessToken = this.client.config.accessToken
        assert(accessToken, 'Client access token provider is required')

        const normalize = (value: unknown): string => {
            assert(typeof value === 'string' && value.length > 0, 'Resolved access token must be a non-empty string')
            return value as string
        }

        if (typeof accessToken === 'string') {
            return normalize(accessToken)
        }

        if (typeof accessToken === 'function') {
            const token = await accessToken(undefined, [])
            return normalize(token)
        }

        const token = await accessToken
        return normalize(token)
    }

    // ------------------------------------------------------------------------
    // Workflow API Operations
    // ------------------------------------------------------------------------

    /**
     * Find a workflow by name
     */
    private async findWorkflowByName(workflowName: string): Promise<WorkflowV2025 | undefined> {
        assert(workflowName, 'Workflow name is required')
        assert(this.client, 'Client service is required')

        const { workflowsApi } = this.client

        this.log.debug(`Searching for existing workflow: ${workflowName}`)
        const listWorkflows = async () => {
            const response = await workflowsApi.listWorkflows()
            return {
                data: response.data || [],
            }
        }

        const workflows = await this.client.execute(
            listWorkflows,
            undefined,
            'MessagingService>findWorkflowByName listWorkflows'
        )

        assert(workflows, `Failed to list workflows: ${workflowName}`)

        const workflow = workflows.data.find((w) => w.name === workflowName)

        return workflow
    }

    /**
     * Create a workflow
     */
    private async createWorkflow(createWorkflowRequestV2025: CreateWorkflowRequestV2025): Promise<WorkflowV2025> {
        assert(createWorkflowRequestV2025, 'Workflow request is required')
        assert(this.client, 'Client service is required')

        const { workflowsApi } = this.client
        assert(workflowsApi, 'Workflows API is required')

        this.log.debug('Creating email workflow')
        const createWorkflowFn = async () => {
            const response = await workflowsApi.createWorkflow({ createWorkflowRequestV2025 })
            return response.data
        }
        const workflowData = await this.client.execute(createWorkflowFn)
        assert(workflowData, 'Failed to create workflow')
        assert(workflowData.id, 'Workflow ID is required')

        return workflowData
    }

    /**
     * Execute a workflow through the test endpoint and return the HTTP response wrapper.
     */
    private async testWorkflow(requestParameters: WorkflowsV2025ApiTestWorkflowRequest) {
        assert(requestParameters, 'Workflow request parameters are required')
        assert(requestParameters.id, 'Workflow ID is required')
        assert(requestParameters.testWorkflowRequestV2025, 'Test workflow request is required')
        assert(this.client, 'Client service is required')

        const { workflowsApi } = this.client
        assert(workflowsApi, 'Workflows API is required')

        this.log.debug(`Executing workflow ${requestParameters.id}`)
        const testWorkflowFn = async () => {
            const response = await workflowsApi.testWorkflow(requestParameters)
            return response
        }
        const response = await this.client.execute(testWorkflowFn)
        assert(response, 'Workflow response is required')
        this.log.debug(`Workflow executed. Response code ${response.status}`)
        return response
    }
}
