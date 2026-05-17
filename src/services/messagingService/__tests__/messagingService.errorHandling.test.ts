import { MessagingService } from '../messagingService'

const createMessagingService = (workflowPayload?: { padding?: string }) => {
    const workflowsApi = {
        listWorkflows: jest.fn().mockResolvedValue({
            data: [
                {
                    id: 'wf-email-1',
                    name: 'Fusion Email Sender (Test Tenant)',
                    enabled: false,
                    ...workflowPayload,
                },
            ],
        }),
        getWorkflow: jest.fn().mockResolvedValue({
            data: {
                id: 'wf-email-1',
                name: 'Fusion Email Sender (Test Tenant)',
                enabled: false,
                ...workflowPayload,
            },
        }),
        testWorkflow: jest.fn(),
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
    return { service, workflowsApi, log }
}

describe('MessagingService error handling', () => {
    it('catches and logs errors during sendEmail without crashing', async () => {
        const { service, workflowsApi, log } = createMessagingService()

        // Mock testWorkflow to reject with an error
        const mockError = new Error('Simulated workflow failure')
        workflowsApi.testWorkflow.mockRejectedValue(mockError)

        const report = {
            accounts: [],
            totalAccounts: 0,
            matches: 0,
        } as any

        await expect(
            service.deliverReportToRecipients(report, {
                recipients: ['reviewer@example.com'],
                reportType: 'aggregation',
                reportTitle: 'Test Report',
            })
        ).resolves.not.toThrow()

        expect(log.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to execute email workflow wf-email-1: Error: Simulated workflow failure')
        )
    })
})
