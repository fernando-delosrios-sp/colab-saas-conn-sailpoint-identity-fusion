import type { TemplateDelegate as HandlebarsTemplateDelegate } from 'handlebars'
import { FormInstanceResponseV2025 } from 'sailpoint-api-client'
import { FusionConfig, SourceType } from '../../model/config'
import { ClientService } from '../clientService'
import { LogService } from '../logService'
import { IdentityService } from '../identityService'
import { SourceService } from '../sourceService'
import { WorkflowService } from '../workflowService'
import { assert, softAssert } from '../../utils/assert'
import { createUrlContext, getUIOriginFromBaseUrl, UrlContext } from '../../utils/url'
import { pickAttributes } from '../../utils/attributes'
import { compileEmailTemplates, renderFusionReviewEmail, FusionReviewEmailData } from './helpers'
import { registerHandlebarsHelpers } from './messagingHandlebarsRegistration'
import { normalizeEmailValue, sanitizeRecipients } from './email'
import { normalizeLanguageCode } from './localization'

export interface FusionEmailContext {
    accountName: string
    accountSource: string
    sourceType?: SourceType
    accountId?: string
    accountEmail?: string
    accountAttributes: Record<string, any>
    candidates: Array<{
        id: string
        name: string
        attributes: Record<string, any>
        scores?: any[]
    }>
}

export class EmailService {
    public static readonly WORKFLOW_COMBINED_LIMIT_BYTES = 1_500_000
    public static readonly WORKFLOW_COMBINED_SAFETY_MARGIN_BYTES = 200_000
    public static readonly FALLBACK_MAX_TEST_INPUT_BYTES = 120_000
    public static readonly TRUNCATION_NOTICE_HTML =
        '<div style="margin-top:16px;padding:12px;border:1px solid #fde68a;border-left:6px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:12px;">Report content was truncated to fit ISC workflow input size limits.</div>'

    protected templates: Map<string, HandlebarsTemplateDelegate>
    protected urlContext: UrlContext
    protected isDevelopmentMode: boolean
    protected emailSenderWorkflowDefinitionBytes: number | undefined

    constructor(
        protected config: FusionConfig,
        protected log: LogService,
        protected client: ClientService,
        protected sources: SourceService,
        protected identities?: IdentityService,
        protected workflows?: WorkflowService
    ) {
        this.workflows = workflows ?? new WorkflowService(config, log, client, sources)
        registerHandlebarsHelpers()
        this.templates = compileEmailTemplates()
        this.urlContext = createUrlContext(config.baseurl)
        this.isDevelopmentMode = false
    }

    /**
     * Build the standard email header subtitle.
     */
    public buildEmailHeaderSubtitle(): string | undefined {
        const configured = (this.config as any).emailHeaderSubtitle
        if (configured) return configured

        if (!this.config.baseurl || typeof this.config.baseurl !== 'string') return undefined

        try {
            const parsed = new URL(this.config.baseurl)
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
        } catch {
            return undefined
        }

        const origin = getUIOriginFromBaseUrl(this.config.baseurl)
        if (!origin) return undefined

        const host = origin.replace(/^https?:\/\//, '')
        const sourceObj = (this.sources as any)?.fusionSource
        let sourceName: string
        if (sourceObj && typeof sourceObj === 'object' && 'name' in sourceObj) {
            sourceName = sourceObj.name || 'Fusion source'
        } else {
            const fetched = (this.sources as any)?.getFusionSource?.()
            sourceName = fetched?.name || 'Fusion source'
        }
        return `${host} - ${sourceName}`
    }

    /**
     * Send review email to reviewers for a newly created form instance.
     */
    public async sendFusionEmail(
        formInstance: FormInstanceResponseV2025,
        context?: FusionEmailContext
    ): Promise<void> {
        assert(formInstance, 'Form instance is required')
        assert(formInstance.recipients && formInstance.recipients.length > 0, 'Form instance recipients are required')

        const workflow = await this.getWorkflow()
        assert(workflow, 'Email workflow is required')

        const recipientIds = formInstance.recipients?.map((r) => r.id).filter(Boolean) as string[] ?? []
        assert(recipientIds.length > 0, 'Recipient IDs are required')

        const recipients = await this.getRecipientEmails(recipientIds)
        if (recipients.length === 0) {
            this.log.warn(`No email addresses found for recipient IDs: ${recipientIds.join(', ')}`)
            return
        }

        const accountName = context?.accountName || 'Unknown Account'
        const accountSource = context?.accountSource || 'Unknown Source'

        const selectedAttributes =
            (this.config.fusionFormAttributes && this.config.fusionFormAttributes.length > 0)
                ? this.config.fusionFormAttributes
                : ['id', 'name', 'email', 'status', 'department', 'title']

        const pickedAccountAttributes = context?.accountAttributes
            ? pickAttributes(context.accountAttributes, selectedAttributes)
            : {}

        const candidates = context?.candidates || []
        const accountId = context?.accountId
        const accountUrl = accountId ? this.urlContext.humanAccount(accountId) : undefined
        const accountEmail = normalizeEmailValue(context?.accountEmail)[0]

        const sourceTypeInput = context?.sourceType
        const sourceType =
            sourceTypeInput === SourceType.Authoritative || sourceTypeInput === SourceType.Record
                ? (sourceTypeInput as SourceType)
                : (sourceTypeInput === SourceType.Orphan ? (sourceTypeInput as SourceType) : undefined)

        const emailData: FusionReviewEmailData = {
            totalAccounts: 1,
            matches: candidates.length,
            reportDate: new Date(),
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
                        exact: Boolean(candidate.exact),
                        scores: (candidate.scores || []).map((s: any) => ({
                            name: s.name || s.attributeName || 'Unknown',
                            matched: Boolean(s.matched),
                            type: s.type,
                            weight: s.weight,
                            sourceValue: s.sourceValue,
                            targetValue: s.targetValue,
                            exact: Boolean(s.exact),
                        })),
                    })),
                },
            ],
        }

        const primaryRecipientId = recipientIds[0]
        emailData.locale = await this.getRecipientLocale(primaryRecipientId)

        const body = renderFusionReviewEmail(this.templates, emailData)
        const subject = `${accountName} (${accountSource}) - Review candidate identity match`

        await this.sendEmail(recipients, subject, body)
        this.log.info(`Sent fusion review email to ${recipients.length} recipient(s) for form ${formInstance.id}`)
    }

    /**
     * Refresh byte count of serialized workflow definition.
     */
    public async refreshEmailWorkflowDefinitionBytes(): Promise<void> {
        try {
            const workflow = await this.getWorkflow()
            if (!workflow?.id) return

            const definition = await this.client.call<any>(
                async (api: any) => {
                    const resp = await (api.workflows as any)?.getWorkflow?.({ id: workflow.id })
                    return (resp as any)?.data ?? resp
                },
                { context: `EmailService>getWorkflow id=${workflow.id}` }
            )
            if (definition) {
                this.emailSenderWorkflowDefinitionBytes = Buffer.byteLength(JSON.stringify(definition), 'utf8')
            }
        } catch {
            this.emailSenderWorkflowDefinitionBytes = undefined
        }
    }

    /**
     * Send email to recipients via workflow execution.
     */
    public async sendEmail(recipients: string[], subject: string, body: string): Promise<void> {
        assert(recipients && recipients.length > 0, 'Email recipients are required')
        assert(subject, 'Email subject is required')
        assert(body, 'Email body is required')

        const validRecipients = sanitizeRecipients(recipients)
        if (validRecipients.length === 0) {
            this.log.warn('No valid email recipients found after filtering empty/invalid emails')
            return
        }

        const workflow = await this.getWorkflow()
        assert(workflow.id, 'Email workflow ID is required')

        await this.refreshEmailWorkflowDefinitionBytes()

        const accessToken = await this.resolveAccessToken()
        assert(accessToken, 'Unable to resolve access token for email workflow')

        const maxSerializedInputBytes = this.getMaxTestWorkflowInputBytes()
        const fittedBody = this.fitEmailBodyToWorkflowLimit(subject, validRecipients, body, maxSerializedInputBytes)

        const request = {
            input: {
                recipients: validRecipients.join(','),
                subject,
                body: fittedBody,
                accessToken,
            },
        }

        const requestParameters = {
            id: workflow.id,
            testWorkflowRequestV2025: request,
        }

        try {
            const response = await this.executeWorkflowTest(requestParameters)
            assert(response, 'Email workflow response is required')
            softAssert(
                response.status === 200,
                `Failed to send email workflow - received status ${response.status}`,
                'error'
            )
            this.log.info(`Sent email "${subject}" to ${validRecipients.length} recipient(s)`)
        } catch (e) {
            const errStr = e instanceof Error ? e.toString() : String(e)
            this.log.error(
                `Failed to execute email workflow ${workflow.id}: ${errStr}`
            )
        }
    }

    public workflowInputByteLength(subject: string, body: string, recipients: string[]): number {
        return Buffer.byteLength(
            JSON.stringify({
                input: {
                    recipients: recipients.join(','),
                    subject,
                    body,
                    accessToken: 'x'.repeat(128),
                },
            }),
            'utf8'
        )
    }

    public getMaxTestWorkflowInputBytes(): number {
        if (typeof this.emailSenderWorkflowDefinitionBytes === 'number') {
            const allowed =
                EmailService.WORKFLOW_COMBINED_LIMIT_BYTES -
                this.emailSenderWorkflowDefinitionBytes -
                EmailService.WORKFLOW_COMBINED_SAFETY_MARGIN_BYTES
            return Math.max(1024, allowed)
        }
        return (this.config as any).maxTestWorkflowInputBytes ?? EmailService.FALLBACK_MAX_TEST_INPUT_BYTES
    }

    public fitEmailBodyToWorkflowLimit(
        subject: string,
        recipients: string[],
        body: string,
        maxSerializedInputBytes: number
    ): string {
        const currentBytes = this.workflowInputByteLength(subject, body, recipients)
        if (currentBytes <= maxSerializedInputBytes) return body

        const sampleToken = 'x'.repeat(128)
        const envelopeBytes = Buffer.byteLength(
            JSON.stringify({ input: { recipients: recipients.join(','), subject, body: '', accessToken: sampleToken } }),
            'utf8'
        )
        const allowedBodyBytes = Math.max(256, maxSerializedInputBytes - envelopeBytes - 128)
        const bodyBuf = Buffer.from(body, 'utf8')
        if (bodyBuf.length <= allowedBodyBytes) return body

        const truncatedBuf = bodyBuf.subarray(0, allowedBodyBytes)
        const text = truncatedBuf.toString('utf8')
        const notice = EmailService.TRUNCATION_NOTICE_HTML
        return text + notice
    }

    public async getRecipientLocale(recipientId: string | undefined): Promise<string | undefined> {
        if (!recipientId || !this.identities) return undefined

        try {
            const identity = this.identities.getIdentityById(recipientId)
            const attributes = (identity as any)?.attributes || {}
            const rawLang =
                attributes.preferredLanguage ||
                attributes.language ||
                attributes.locale ||
                attributes.userLanguage

            return normalizeLanguageCode(rawLang)
        } catch (e) {
            this.log.debug(`Unable to resolve locale for identity ${recipientId}: ${e}`)
            return undefined
        }
    }

    public async getRecipientEmails(identityIds: (string | undefined)[]): Promise<string[]> {
        const validIds = identityIds.filter(Boolean) as string[]
        if (validIds.length === 0 || !this.identities) return []

        const emails = new Set<string>()

        for (const id of validIds) {
            try {
                const identity = this.identities.getIdentityById(id)
                const attributes = (identity as any)?.attributes || {}
                const email = identity?.email || attributes.email || attributes.workEmail
                const normalized = normalizeEmailValue(email)[0]
                if (normalized) {
                    emails.add(normalized)
                }
            } catch (e) {
                this.log.debug(`Unable to resolve email for recipient ${id}: ${e}`)
            }
        }

        return Array.from(emails)
    }

    private async getWorkflow(): Promise<any> {
        if (this.workflows) {
            return this.workflows.getWorkflow()
        }
        throw new Error('Workflow service is required for email execution')
    }

    private async resolveAccessToken(): Promise<string> {
        if (this.workflows) {
            return this.workflows.resolveAccessToken()
        }
        const accessToken = this.client.accessToken
        assert(accessToken, 'Client access token provider is required')
        return typeof accessToken === 'string'
            ? accessToken
            : typeof accessToken === 'function'
              ? await accessToken(undefined, [])
              : await accessToken
    }

    private async executeWorkflowTest(params: any): Promise<any> {
        if (this.workflows) {
            return this.workflows.testWorkflow(params)
        }
        return this.client.call<any>(
            (api: any) => api.workflows.testWorkflow(params),
            { context: `EmailService>testWorkflow id=${params.id}` }
        )
    }
}
