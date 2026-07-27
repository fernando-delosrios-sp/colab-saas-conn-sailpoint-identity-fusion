import { EmailService } from '../emailService'

const createEmailService = (workflowPayload?: { padding?: string }) => {
    const workflowsApi = {
        listWorkflows: vi.fn().mockResolvedValue({
            data: [
                {
                    id: 'wf-email-1',
                    name: 'Fusion Email Sender (Test Tenant)',
                    enabled: false,
                    ...workflowPayload,
                },
            ],
        }),
        getWorkflow: vi.fn().mockResolvedValue({
            data: {
                id: 'wf-email-1',
                name: 'Fusion Email Sender (Test Tenant)',
                enabled: false,
                ...workflowPayload,
            },
        }),
        testWorkflow: vi.fn(),
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
        detail: vi.fn(),
        recordEvent: vi.fn(),
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
    return { service, workflowsApi, log }
}

describe('EmailService error handling', () => {
    it('catches and logs errors during sendEmail without crashing', async () => {
        const { service, workflowsApi, log } = createEmailService()

        // Mock testWorkflow to reject with an error
        const mockError = new Error('Simulated workflow failure')
        workflowsApi.testWorkflow.mockRejectedValue(mockError)

        await expect(
            service.sendEmail(['reviewer@example.com'], 'Test Report', '<html><body>Report</body></html>')
        ).resolves.not.toThrow()

        expect(log.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to execute email workflow wf-email-1: Error: Simulated workflow failure')
        )
    })
})

describe('EmailService.getRecipientEmails', () => {
    it('resolves emailAddress from identity profile API fallback', async () => {
        const { service } = createEmailService()
        const identities = {
            getIdentityById: vi.fn(() => ({ id: 'owner-1', attributes: {} })),
            hydrateMissingIdentitiesById: vi.fn(async () => undefined),
            fetchIdentityById: vi.fn(async () => ({ id: 'owner-1', attributes: {} })),
            fetchIdentityProfileById: vi.fn(async () => ({
                id: 'owner-1',
                email: 'owner@example.com',
                attributes: { email: 'owner@example.com' },
            })),
        }
        ;(service as any).identities = identities

        const emails = await service.getRecipientEmails(['owner-1'])

        expect(emails).toEqual(['owner@example.com'])
        expect(identities.fetchIdentityProfileById).toHaveBeenCalledWith('owner-1')
    })
})

