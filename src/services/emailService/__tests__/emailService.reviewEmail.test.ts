import { EmailService } from '../emailService'
import { compileEmailTemplates, renderFusionReviewEmail } from '../helpers'
import { registerHandlebarsHelpers } from '../messagingHandlebarsRegistration'

const createEmailService = (overrides: Partial<{ config: Record<string, unknown>; identities: Record<string, unknown> }> = {}) => {
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
        enableLocalization: true,
        ...(overrides.config ?? {}),
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
        ...(overrides.identities ?? {}),
    } as any
    const service = new EmailService(config, log, client, sources, identities)
    return { service, workflowsApi, identities }
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

    it('localizes review email subject and body for Spanish recipients when enabled', async () => {
        const { service, workflowsApi } = createEmailService({
            identities: {
                getIdentityById: vi.fn((id: string) => ({
                    id,
                    attributes: { preferredLanguage: 'es', email: 'reviewer@example.com' },
                })),
            },
        })
        const formInstance = {
            id: 'form-1',
            standAloneFormUrl: 'https://tenant.identitynow.com/ui/forms/review/form-1',
            recipients: [{ id: 'reviewer-1' }],
        } as any

        await service.sendFusionEmail(formInstance, {
            accountName: '125536',
            accountSource: 'Workday - Employees',
            accountAttributes: { firstname: 'Michael' },
        })

        const sent = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input
        expect(sent.subject).toContain('Revisar coincidencia')
        expect(sent.body).toContain('Abrir formulario de revisión')
    })

    it('includes Open Review Form button when form instance has standAloneFormUrl', async () => {
        const { service, workflowsApi } = createEmailService()
        const reviewUrl = 'https://tenant.identitynow.com/ui/forms/review/form-1'
        const formInstance = {
            id: 'form-1',
            standAloneFormUrl: reviewUrl,
            recipients: [{ id: 'reviewer-1' }],
        } as any

        await service.sendFusionEmail(formInstance, {
            accountName: '125536',
            accountSource: 'Workday - Employees',
            accountAttributes: { firstname: 'Michael' },
        })

        const sentBody = workflowsApi.testWorkflow.mock.calls[0][0].testWorkflowRequestV2025.input.body as string
        expect(sentBody).toContain('Open Review Form')
        expect(sentBody).toContain(reviewUrl)
    })

    it('renders review email scores via mapScoreReportsForFusionReport helper path', () => {
        registerHandlebarsHelpers()
        const templates = compileEmailTemplates()
        const html = renderFusionReviewEmail(templates, {
            totalAccounts: 1,
            matches: 1,
            reportDate: new Date('2026-07-27'),
            locale: 'fr',
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
                                    attribute: 'Combined score',
                                    algorithm: 'weighted-mean',
                                    score: 85,
                                    weightedScore: 42,
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
        expect(html).toContain('Score combiné')
        expect(html).not.toContain('combined_score_attribute')
    })
})





