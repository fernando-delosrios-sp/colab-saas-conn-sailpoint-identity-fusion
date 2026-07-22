import { EmailService } from '../emailService'

const createEmailService = (workflowPayload?: { padding?: string }) => {
    const workflowsApi = {
        listWorkflows: vi.fn().mockResolvedValue({
            data: [{ id: 'wf-email-1', name: 'Fusion Email Sender (Test Tenant)', enabled: false }],
        }),
        getWorkflow: vi.fn().mockResolvedValue({
            data: {
                id: 'wf-email-1',
                name: 'Fusion Email Sender (Test Tenant)',
                enabled: false,
                ...workflowPayload,
            },
        }),
        testWorkflow: vi.fn().mockResolvedValue({ status: 200 }),
    }
    const client = {
        config: { accessToken: 'token' },
        workflowsApi,
        call: vi.fn(async (fn: (api: any) => Promise<any>, _options?: any) => {
            return await fn({ workflows: workflowsApi })
        }),
    } as any
    const log = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as any
    const config = {
        workflowName: 'Fusion Email Sender',
        delayedAggregationWorkflowName: 'Fusion Delayed Aggregation',
        cloudDisplayName: 'Test Tenant',
        baseurl: 'https://tenant.api.identitynow.com',
        fusionFormAttributes: [],
    } as any
    const sources = {
        fusionSourceOwner: { id: 'owner-1', type: 'IDENTITY' },
        getFusionSource: vi.fn(() => ({ name: 'Fusion Source' })),
    } as any
    const service = new EmailService(config, log, client, sources)
    return { service, workflowsApi }
}

describe('EmailService report size limits', () => {
    it('trims oversized report body to fit workflow payload limit', async () => {
        const { service, workflowsApi } = createEmailService()
        const hugeText = 'A'.repeat(2_000_000)

        await service.sendEmail(['reviewer@example.com'], 'Test Report', hugeText)

        expect(workflowsApi.getWorkflow).toHaveBeenCalled()
        expect(workflowsApi.testWorkflow).toHaveBeenCalledTimes(1)
        const sentInput = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        const payloadBytes = Buffer.byteLength(
            JSON.stringify({
                input: { subject: sentInput.subject, body: sentInput.body, recipients: sentInput.recipients },
            }),
            'utf8'
        )
        const definitionBytes = Buffer.byteLength(
            JSON.stringify({ id: 'wf-email-1', name: 'Fusion Email Sender (Test Tenant)', enabled: false }),
            'utf8'
        )
        expect(definitionBytes + payloadBytes).toBeLessThanOrEqual(1_500_000)
        expect(sentInput.body).toContain('Report content was truncated to fit ISC workflow input size limits')
    })

    it('keeps regular report body unchanged when under limit', async () => {
        const { service, workflowsApi } = createEmailService()

        await service.sendEmail(['reviewer@example.com'], 'Test Report', '<html><body>Alice</body></html>')

        const sentInput = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        expect(sentInput.body).not.toContain('Report content was truncated to fit ISC workflow input size limits')
    })

    it('shrinks report body when workflow definition already consumes most of the combined budget', async () => {
        const largeDefinition = 'D'.repeat(1_250_000)
        const { service, workflowsApi } = createEmailService({ padding: largeDefinition })
        const hugeText = 'Z'.repeat(800_000)

        await service.sendEmail(['reviewer@example.com'], 'Test Report', hugeText)

        const fullWorkflow = {
            id: 'wf-email-1',
            name: 'Fusion Email Sender (Test Tenant)',
            enabled: false,
            padding: largeDefinition,
        }
        const definitionBytes = Buffer.byteLength(JSON.stringify(fullWorkflow), 'utf8')
        const sentInput = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        const payloadBytes = Buffer.byteLength(
            JSON.stringify({
                input: { subject: sentInput.subject, body: sentInput.body, recipients: sentInput.recipients },
            }),
            'utf8'
        )
        expect(definitionBytes + payloadBytes).toBeLessThanOrEqual(1_500_000)
        expect(sentInput.body.length).toBeLessThan(hugeText.length)
    })

    it('accounts for JSON escaping when trimming report body', async () => {
        const largeDefinition = 'D'.repeat(1_150_000)
        const { service, workflowsApi } = createEmailService({ padding: largeDefinition })
        const escapeHeavyText = '\\"\\n'.repeat(350_000)

        await service.sendEmail(['reviewer@example.com'], 'Test Report', escapeHeavyText)

        const fullWorkflow = {
            id: 'wf-email-1',
            name: 'Fusion Email Sender (Test Tenant)',
            enabled: false,
            padding: largeDefinition,
        }
        const definitionBytes = Buffer.byteLength(JSON.stringify(fullWorkflow), 'utf8')
        const sentInput = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        const payloadBytes = Buffer.byteLength(
            JSON.stringify({
                input: { subject: sentInput.subject, body: sentInput.body, recipients: sentInput.recipients },
            }),
            'utf8'
        )
        expect(definitionBytes + payloadBytes).toBeLessThanOrEqual(1_500_000)
        expect(sentInput.body).toContain('Report content was truncated to fit ISC workflow input size limits')
    })
})
