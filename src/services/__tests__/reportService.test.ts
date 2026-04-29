import { SourceType } from '../../model/config'
import { ReportService } from '../reportService'

describe('ReportService', () => {
    const createService = (overrides: Partial<any> = {}) => {
        const log = {
            getAggregationIssueSummary: jest.fn(() => ({
                warningCount: 1,
                errorCount: 2,
                warningSamples: ['w1'],
                errorSamples: ['e1'],
            })),
        }
        const sources = {
            fusionAccountCount: 7,
            getSourceByNameSafe: jest.fn((name?: string) =>
                name ? { sourceType: SourceType.Authoritative } : undefined
            ),
            resolveIscAccountIdForManagedKey: jest.fn((id?: string) => id),
        }
        const identities = {
            getIdentityById: jest.fn((id?: string) => (id ? { id, displayName: `Name ${id}` } : undefined)),
            hydrateMissingIdentitiesById: jest.fn(async () => undefined),
        }
        const forms = {
            finishedFusionDecisions: [],
            formsCreated: 1,
            formInstancesCreated: 2,
            formsFound: 3,
            formInstancesFound: 4,
            answeredFormInstancesProcessed: 5,
        }
        const fusion = {
            totalFusionAccountCount: 11,
            newManagedAccountsCount: 13,
            identitiesProcessedCount: 17,
        }
        const messaging = {
            fetchSender: jest.fn(async () => undefined),
            sendReport: jest.fn(async () => undefined),
            sendReportTo: jest.fn(async () => undefined),
            deliverReportToRecipients: jest.fn(async () => undefined),
            renderFusionReportHtml: jest.fn(() => '<html/>'),
        }
        return {
            service: new ReportService(
                'https://example.api.identitynow.com',
                log as any,
                { ...sources, ...(overrides.sources ?? {}) } as any,
                { ...identities, ...(overrides.identities ?? {}) } as any,
                { ...forms, ...(overrides.forms ?? {}) } as any,
                { ...fusion, ...(overrides.fusion ?? {}) } as any,
                { ...messaging, ...(overrides.messaging ?? {}) } as any
            ),
            deps: { log, sources, identities, forms, fusion, messaging },
        }
    }

    it('hydrates missing identity ids from report decisions', async () => {
        const idsSeen: string[][] = []
        const { service } = createService({
            forms: {
                finishedFusionDecisions: [
                    { submitter: { id: 'rev-1' }, identityId: 'id-1' },
                    { submitter: { id: 'rev-1' }, identityId: 'id-2' },
                ],
            },
            identities: {
                hydrateMissingIdentitiesById: jest.fn(async (ids: string[]) => idsSeen.push(ids)),
            },
        })

        await service.hydrateIdentitiesForReportDecisions()

        expect(idsSeen).toHaveLength(1)
        expect(new Set(idsSeen[0])).toEqual(new Set(['rev-1', 'id-1', 'id-2']))
    })

    it('builds review decisions with resolved account and identity links', () => {
        const { service } = createService({
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: { id: 'acc-1', name: 'Account 1', sourceName: 'source-a' },
                        submitter: { id: 'rev-1', name: '' },
                        identityId: 'id-1',
                        newIdentity: false,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions).toHaveLength(1)
        expect(decisions[0].reviewerName).toBe('Name rev-1')
        expect(decisions[0].selectedIdentityName).toBe('Name id-1')
        expect(decisions[0].accountUrl).toContain('/human-accounts/')
        expect(decisions[0].decision).toBe('assign-existing-identity')
    })

    it('builds report stats from decisions and aggregation inputs', () => {
        const { service } = createService({
            forms: {
                finishedFusionDecisions: [
                    { sourceType: SourceType.Authoritative, newIdentity: true, automaticAssignment: false },
                    { sourceType: SourceType.Record, newIdentity: true, automaticAssignment: true },
                    { sourceType: SourceType.Orphan, newIdentity: false, automaticAssignment: false },
                ],
            },
        })

        const stats = service.buildFusionReportStats({
            identitiesFound: 21,
            managedAccountsFound: 34,
            totalProcessingTime: '10s',
        })

        expect(stats.fusionReviewDecisionsAuthoritative).toBe(1)
        expect(stats.fusionReviewDecisionsRecord).toBe(1)
        expect(stats.fusionReviewDecisionsOrphan).toBe(1)
        expect(stats.fusionReviewNoMatchesRecord).toBe(1)
        expect(stats.fusionAutomaticMatches).toBe(1)
        expect(stats.identitiesFound).toBe(21)
        expect(stats.managedAccountsFound).toBe(34)
    })

    it('delegates dry-run report delivery to messaging service without sender prefetch', async () => {
        const { service, deps } = createService()
        const report = {
            accounts: [{ matches: [{ identityName: 'Name', isMatch: true }] }],
            totalAccounts: 1,
            matches: 1,
            fusionReviewDecisions: [],
        } as any
        const finalDryRunStats = {
            identitiesFound: 1,
            managedAccountsFound: 1,
            totalProcessingTime: '1s',
            phaseTiming: [],
        } as any

        service.setDryRunRuntimeOptions({ sendReportTo: ['reviewer@example.com'] })
        await service.writeAndSendDryRunReport({
            report,
            finalDryRunStats,
        })

        expect(deps.messaging.deliverReportToRecipients).toHaveBeenCalledTimes(1)
        expect(deps.messaging.fetchSender).not.toHaveBeenCalled()
    })
})
