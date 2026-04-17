import { MessagingService } from '../messagingService'

const createMessagingService = (workflowPayload?: { padding?: string }) => {
    const workflowsApi = {
        listWorkflows: jest.fn().mockResolvedValue({
            data: [{ id: 'wf-email-1', name: 'Fusion Email Sender (Test Tenant)', enabled: false }],
        }),
        getWorkflow: jest.fn().mockResolvedValue({
            data: {
                id: 'wf-email-1',
                name: 'Fusion Email Sender (Test Tenant)',
                enabled: false,
                ...workflowPayload,
            },
        }),
        testWorkflow: jest.fn().mockResolvedValue({ status: 200 }),
    }
    const client = {
        config: { accessToken: 'token' },
        workflowsApi,
        execute: jest.fn(async (fn: () => Promise<any>) => await fn()),
    } as any
    const log = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
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
        getFusionSource: jest.fn(() => ({ name: 'Fusion Source' })),
    } as any
    const service = new MessagingService(config, log, client, sources)
    return { service, workflowsApi }
}

describe('MessagingService report size limits', () => {
    it('trims oversized report body to fit workflow payload limit', async () => {
        const { service, workflowsApi } = createMessagingService()
        const hugeText = 'A'.repeat(2_000_000)
        const report = {
            accounts: [{ accountName: hugeText, accountSource: 'HR', matches: [{ identityName: 'x', isMatch: true }] }],
            totalAccounts: 1,
            matches: 1,
        } as any

        await service.sendReportTo(report, { recipients: ['reviewer@example.com'], reportType: 'aggregation' })

        expect(workflowsApi.getWorkflow).toHaveBeenCalled()
        expect(workflowsApi.testWorkflow).toHaveBeenCalledTimes(1)
        const sentInput = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        const payloadBytes = Buffer.byteLength(
            JSON.stringify({ input: { subject: sentInput.subject, body: sentInput.body, recipients: sentInput.recipients } }),
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
        const { service, workflowsApi } = createMessagingService()
        const report = {
            accounts: [{ accountName: 'Alice', accountSource: 'HR', matches: [{ identityName: 'Alice', isMatch: true }] }],
            totalAccounts: 1,
            matches: 1,
        } as any

        await service.sendReportTo(report, { recipients: ['reviewer@example.com'], reportType: 'aggregation' })

        const sentInput = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        expect(sentInput.body).not.toContain('Report content was truncated to fit ISC workflow input size limits')
    })

    it('shrinks report body when workflow definition already consumes most of the combined budget', async () => {
        const largeDefinition = 'D'.repeat(1_250_000)
        const { service, workflowsApi } = createMessagingService({ padding: largeDefinition })
        const hugeText = 'Z'.repeat(800_000)
        const report = {
            accounts: [{ accountName: hugeText, accountSource: 'HR', matches: [{ identityName: 'x', isMatch: true }] }],
            totalAccounts: 1,
            matches: 1,
        } as any

        await service.sendReportTo(report, { recipients: ['reviewer@example.com'], reportType: 'aggregation' })

        const fullWorkflow = {
            id: 'wf-email-1',
            name: 'Fusion Email Sender (Test Tenant)',
            enabled: false,
            padding: largeDefinition,
        }
        const definitionBytes = Buffer.byteLength(JSON.stringify(fullWorkflow), 'utf8')
        const sentInput = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        const payloadBytes = Buffer.byteLength(
            JSON.stringify({ input: { subject: sentInput.subject, body: sentInput.body, recipients: sentInput.recipients } }),
            'utf8'
        )
        expect(definitionBytes + payloadBytes).toBeLessThanOrEqual(1_500_000)
        expect(sentInput.body.length).toBeLessThan(hugeText.length)
    })

    it('accounts for JSON escaping when trimming report body', async () => {
        const largeDefinition = 'D'.repeat(1_150_000)
        const { service, workflowsApi } = createMessagingService({ padding: largeDefinition })
        const escapeHeavyText = '\\"\\n'.repeat(350_000)
        const report = {
            accounts: [{ accountName: escapeHeavyText, accountSource: 'HR', matches: [{ identityName: 'x', isMatch: true }] }],
            totalAccounts: 1,
            matches: 1,
        } as any

        await service.sendReportTo(report, { recipients: ['reviewer@example.com'], reportType: 'aggregation' })

        const fullWorkflow = {
            id: 'wf-email-1',
            name: 'Fusion Email Sender (Test Tenant)',
            enabled: false,
            padding: largeDefinition,
        }
        const definitionBytes = Buffer.byteLength(JSON.stringify(fullWorkflow), 'utf8')
        const sentInput = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        const payloadBytes = Buffer.byteLength(
            JSON.stringify({ input: { subject: sentInput.subject, body: sentInput.body, recipients: sentInput.recipients } }),
            'utf8'
        )
        expect(definitionBytes + payloadBytes).toBeLessThanOrEqual(1_500_000)
        expect(sentInput.body).toContain('Report content was truncated to fit ISC workflow input size limits')
    })
})
