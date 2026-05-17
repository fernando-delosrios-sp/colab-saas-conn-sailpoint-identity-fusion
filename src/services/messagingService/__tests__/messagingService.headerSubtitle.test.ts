import { MessagingService } from '../messagingService'

const createMessagingService = (baseurl: string, getFusionSourceReturnValue: any = { name: 'Fusion Source' }) => {
    const workflowsApi = {}
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
        baseurl,
        fusionFormAttributes: [],
    } as any
    const sources = {
        fusionSourceOwner: { id: 'owner-1', type: 'IDENTITY' },
        getFusionSource: jest.fn(() => getFusionSourceReturnValue),
    } as any
    const service = new MessagingService(config, log, client, sources)
    return { service }
}

describe('MessagingService email header subtitle', () => {
    it('returns undefined if baseurl is an invalid URL string', async () => {
        const { service } = createMessagingService('not-a-valid-url')

        // Use any to bypass private visibility for test
        const subtitle = (service as any).buildEmailHeaderSubtitle()
        expect(subtitle).toBeUndefined()
    })

    it('returns formatted subtitle for valid url', async () => {
        const { service } = createMessagingService('https://tenant.api.identitynow.com')
        const subtitle = (service as any).buildEmailHeaderSubtitle()
        expect(subtitle).toBe('tenant.identitynow.com - Fusion Source')
    })

    it('uses fallback "Fusion source" when source has no name', async () => {
        const { service } = createMessagingService('https://tenant.api.identitynow.com', null)
        const subtitle = (service as any).buildEmailHeaderSubtitle()
        expect(subtitle).toBe('tenant.identitynow.com - Fusion source')
    })
})
