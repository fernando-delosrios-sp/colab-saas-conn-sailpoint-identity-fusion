import { MessagingService } from '../messagingService'

const createMessagingService = (accessToken: any) => {
    const workflowsApi = {
        listWorkflows: jest.fn().mockResolvedValue({
            data: [
                {
                    id: 'wf-delayed-1',
                    name: 'Fusion Delayed Aggregation (Test Tenant)',
                    enabled: false,
                },
            ],
        }),
        createWorkflow: jest.fn(),
        testWorkflow: jest.fn().mockResolvedValue({ status: 200 }),
    }

    const client = {
        config: { accessToken },
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
    } as any

    const service = new MessagingService(config, log, client, sources)
    return { service, workflowsApi, client }
}

describe('MessagingService delayed aggregation workflow', () => {
    it('builds delayed aggregation workflow payload with bearer token and disableOptimization', async () => {
        const { service, workflowsApi } = createMessagingService('token-123')

        await service.scheduleDelayedAggregation({
            sourceId: 'source-abc',
            delayMinutes: 5,
            disableOptimization: true,
        })

        expect(workflowsApi.testWorkflow).toHaveBeenCalledTimes(1)
        expect(workflowsApi.testWorkflow).toHaveBeenCalledWith({
            id: 'wf-delayed-1',
            testWorkflowRequestV2025: {
                input: {
                    delay: '5m',
                    requestUrl: 'https://tenant.api.identitynow.com/sources/source-abc/load-accounts?disableOptimization=true',
                    authorizationHeader: 'Bearer token-123',
                },
            },
        })
    })

    it('resolves access token from function provider', async () => {
        const tokenProvider = jest.fn(async () => 'token-from-provider')
        const { service, workflowsApi } = createMessagingService(tokenProvider)

        await service.scheduleDelayedAggregation({
            sourceId: 'source-xyz',
            delayMinutes: 3,
            disableOptimization: false,
        })

        expect(tokenProvider).toHaveBeenCalled()
        expect(workflowsApi.testWorkflow).toHaveBeenCalledWith({
            id: 'wf-delayed-1',
            testWorkflowRequestV2025: {
                input: {
                    delay: '3m',
                    requestUrl: 'https://tenant.api.identitynow.com/sources/source-xyz/load-accounts',
                    authorizationHeader: 'Bearer token-from-provider',
                },
            },
        })
    })
})
