import { EmailService } from '../emailService'

const createEmailService = (baseurl: string, getFusionSourceReturnValue: any = { name: 'Fusion Source' }) => {
    const workflowsApi = {}
    const client = {
        config: { accessToken: 'token' },
        workflowsApi,
        execute: vi.fn(async (fn: () => Promise<any>) => await fn()),
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
        baseurl,
        fusionFormAttributes: [],
    } as any
    const sources = {
        fusionSourceOwner: { id: 'owner-1', type: 'IDENTITY' },
        getFusionSource: vi.fn(() => getFusionSourceReturnValue),
    } as any
    const service = new EmailService(config, log, client, sources)
    return { service }
}

describe('EmailService email header subtitle', () => {
    it('returns undefined if baseurl is an invalid URL string', async () => {
        const { service } = createEmailService('not-a-valid-url')

        const subtitle = service.buildEmailHeaderSubtitle()
        expect(subtitle).toBeUndefined()
    })

    it('returns formatted subtitle for valid url', async () => {
        const { service } = createEmailService('https://tenant.api.identitynow.com')
        const subtitle = service.buildEmailHeaderSubtitle('fr')
        expect(subtitle).toBe('tenant.identitynow.com - Fusion Source')
    })

    it('uses localized fallback when source has no name', async () => {
        const { service } = createEmailService('https://tenant.api.identitynow.com', null)
        const subtitle = service.buildEmailHeaderSubtitle('fr')
        expect(subtitle).toBe('tenant.identitynow.com - Source Fusion')
    })
})


