import { EmailService } from '../emailService'
import { compileEmailTemplates, renderFusionReviewEmail } from '../helpers'

const createEmailService = () => {
    const workflowsApi = {
        listWorkflows: vi.fn().mockResolvedValue({
            data: [{ id: 'wf-email-1', name: 'Fusion Email Sender (Test Tenant)', enabled: false }],
        }),
        getWorkflow: vi.fn().mockResolvedValue({
            data: { id: 'wf-email-1', name: 'Fusion Email Sender (Test Tenant)', enabled: false },
        }),
        testWorkflow: vi.fn().mockResolvedValue({ status: 200 }),
    }
    const client = {
        config: { accessToken: 'token' },
        workflowsApi,
        call: vi.fn(async (fn: (api: any) => Promise<any>) => fn({ workflows: workflowsApi })),
    } as any
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), detail: vi.fn(), recordEvent: vi.fn() } as any
    const config = {
        workflowName: 'Fusion Email Sender',
        delayedAggregationWorkflowName: 'Fusion Delayed Aggregation',
        cloudDisplayName: 'Test Tenant',
        baseurl: 'https://tenant.api.identitynow.com',
        fusionFormAttributes: ['firstname', 'lastname', 'email'],
    } as any
    const sources = {
        fusionSourceOwner: { id: 'owner-1', type: 'IDENTITY' },
        getFusionSource: vi.fn(() => ({ name: 'Fusion Source' })),
    } as any
    const identities = {
        getIdentityById: vi.fn((id: string) => ({
            id,
            attributes: { preferredLanguage: 'en', email: 'reviewer@example.com' },
        })),
        hydrateMissingIdentitiesById: vi.fn().mockResolvedValue(undefined),
    } as any
    const service = new EmailService(config, log, client, sources, identities)
    return { service, workflowsApi }
}

describe('EmailService.sendFusionEmail', () => {
        it('maps candidate scores to the same shape as dry-run reports', async () => {
        const { service, workflowsApi } = createEmailService()
        const formInstance = {
            id: 'form-1',
            recipients: [{ id: 'reviewer-1' }],
        } as any

        await service.sendFusionEmail(formInstance, {
            accountName: '125536',
            accountSource: 'Workday - Employees',
            accountAttributes: { firstname: 'Michael', lastname: 'Eckert' },
            fusionMatches: [
                {
                    identityId: 'd3a1cb345cf34b2ea6fc5f40686cad4c',
                    identityName: 'd3a1cb345cf34b2ea6fc5f40686cad4c',
                    fusionIdentity: {
                        identityId: 'd3a1cb345cf34b2ea6fc5f40686cad4c',
                        name: 'Michael Eckert',
                        attributes: {},
                    },
                    scores: [
                        {
                            attribute: 'firstname',
                            algorithm: 'jaro-winkler',
                            score: 92,
                            weightedScore: 46,
                            fusionScore: 50,
                            isMatch: true,
                        },
                    ],
                },
            ],
            maxCandidates: 5,
        })

        expect(workflowsApi.testWorkflow).toHaveBeenCalledTimes(1)
        const sentBody = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input.body as string
        expect(sentBody).toContain('Michael Eckert')
        expect(sentBody).toContain('firstname')
        expect(sentBody).toContain('Jaro-Winkler')
        expect(sentBody).toContain('92%')
        expect(sentBody).not.toContain('>d3a1cb345cf34b2ea6fc5f40686cad4c<')
        expect(sentBody).not.toContain('Unknown')
    })

    it('renders review email scores via mapScoreReportsForFusionReport helper path', () => {
        const templates = compileEmailTemplates()
        const html = renderFusionReviewEmail(templates, {
            totalAccounts: 1,
            matches: 1,
            reportDate: new Date('2026-07-27'),
            accounts: [
                {
                    accountName: '125536',
                    accountSource: 'Workday - Employees',
                    accountAttributes: { firstname: 'Michael' },
                    matches: [
                        {
                            identityName: 'Jane Candidate',
                            identityId: 'candidate-1',
                            isMatch: true,
                            scores: [
                                {
                                    attribute: 'firstname',
                                    algorithm: 'jaro-winkler',
                                    score: 92,
                                    weightedScore: 46,
                                    fusionScore: 50,
                                    isMatch: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        })

        expect(html).toContain('Jane Candidate')
        expect(html).toContain('firstname')
        expect(html).toContain('92%')
    })
})


