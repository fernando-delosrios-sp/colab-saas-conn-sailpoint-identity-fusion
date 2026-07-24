import { SourceType } from '../../model/config'
import { ReportService } from '../reportService'

describe('ReportService', () => {
    const createService = (overrides: Partial<any> = {}) => {
        const log = {
            getAggregationIssueSummary: vi.fn(() => ({
                warningCount: 1,
                errorCount: 2,
                warningSamples: ['w1'],
                errorSamples: ['e1'],
            })),
        }
        const sources = {
            fusionAccountCount: 7,
            getSourceByNameSafe: vi.fn((name?: string) =>
                name ? { sourceType: SourceType.Authoritative } : undefined
            ),
            resolveIscAccountIdForManagedKey: vi.fn((id?: string) => id),
        }
        const identities = {
            getIdentityById: vi.fn((id?: string) => (id ? { id, displayName: `Name ${id}` } : undefined)),
            hydrateMissingIdentitiesById: vi.fn(async () => undefined),
        }
        const forms = {
            finishedFusionDecisions: [],
            formsCreated: 1,
            formInstancesCreated: 2,
            formsFound: 3,
            formInstancesFound: 4,
            answeredFormInstancesProcessed: 5,
        }
        const fusionRun = {
        }
        const fusion = {
            totalFusionAccountCount: 11,
            newManagedAccountsCount: 13,
            identitiesProcessedCount: 17,
            getFusionIdentity: vi.fn(() => undefined),
            getFusionAccountByManagedKey: vi.fn(() => undefined),
            fusionIdentities: [],
            run: fusionRun,
        }
        const email = {
            sendEmail: vi.fn(async () => undefined),
            getRecipientEmails: vi.fn(async () => ['owner@example.com']),
        }
        const run = {
            ...{
                managedAccountInventory:
                    (overrides.run as any)?.managedAccountInventory ??
                    (overrides.sources as any)?.managedAccountInventory ??
                    new Map<string, any>(),
                hasManagedAccount: (key: string) =>
                    ((overrides.run as any)?.managedAccountInventory ??
                        (overrides.sources as any)?.managedAccountInventory ??
                        new Map<string, any>()).has(key),
                getManagedAccountInfo: (key: string) =>
                    ((overrides.run as any)?.managedAccountInventory ??
                        (overrides.sources as any)?.managedAccountInventory ??
                        new Map<string, any>()).get(key),
            },
            ...(overrides.run ?? {}),
        }
        return {
            service: new ReportService(
                'https://example.api.identitynow.com',
                log as any,
                { ...sources, ...(overrides.sources ?? {}) } as any,
                { ...identities, ...(overrides.identities ?? {}) } as any,
                { ...forms, ...(overrides.forms ?? {}) } as any,
                { ...fusion, ...(overrides.fusion ?? {}) } as any,
                { ...email, ...(overrides.email ?? {}) } as any,
                run as any
            ),
            deps: { log, sources, identities, forms, fusion, email },
        }
    }

    it('builds fusion review decision DTOs with reviewer metadata and account resolution', () => {
        const { service } = createService({
            forms: {
                finishedFusionDecisions: [
                    {
                        id: 'd1',
                        identityId: 'id-100',
                        identityName: 'Target Identity',
                        newIdentity: false,
                        submitter: { id: 'rev-1', name: 'Reviewer Name' },
                        account: {
                            id: 'acc-1',
                            name: 'Target Account',
                            sourceName: 'Source Alpha',
                        },
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()

        expect(decisions).toHaveLength(1)
        expect(decisions[0]).toEqual({
            reviewerId: 'rev-1',
            reviewerName: 'Reviewer Name',
            reviewerUrl: 'https://example.identitynow.com/ui/a/admin/identities/rev-1/details/attributes',
            reviewerEmail: undefined,
            managedAccountKey: 'acc-1',
            accountName: 'Target Account',
            accountUrl: 'https://example.identitynow.com/ui/a/admin/accounts-management/human-accounts/acc-1',
            accountSource: 'Source Alpha',
            sourceType: SourceType.Authoritative,
            decision: 'assign-existing-identity',
            decisionLabel: 'Assigned to existing identity',
            selectedIdentityId: 'id-100',
            selectedIdentityName: 'Target Identity',
            selectedIdentityUrl: 'https://example.identitynow.com/ui/a/admin/identities/id-100/details/attributes',
            comments: undefined,
            formUrl: undefined,
            automaticAssignment: undefined,
        })
    })

    it('prefers managed account display name over raw managed account key when building review decisions', () => {
        const managedAccountInventory = new Map<string, any>([
            ['key-1', { id: 'key-1', name: 'Human Account Display Name' }],
        ])

        const { service } = createService({
            sources: {
                managedAccountInventory,
            },
            forms: {
                finishedFusionDecisions: [
                    {
                        identityId: 'id-200',
                        identityName: 'Correlated Identity',
                        newIdentity: false,
                        submitter: { id: 'rev-2', name: 'Reviewer Two' },
                        account: {
                            id: 'key-1',
                            name: 'key-1',
                            sourceName: 'Source Beta',
                        },
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()

        expect(decisions).toHaveLength(1)
        expect(decisions[0].accountName).toBe('Human Account Display Name')
    })

    it('prefers correlated identity display name over managed account name fallback for assign-existing decisions', () => {
        const managedAccountInventory = new Map<string, any>([
            ['key-1', { id: 'key-1', name: 'Raw Managed Name' }],
        ])

        const { service } = createService({
            sources: {
                managedAccountInventory,
            },
            identities: {
                getIdentityById: vi.fn((id?: string) => (id ? { id, displayName: 'Correlated Identity Name' } : undefined)),
            },
            forms: {
                finishedFusionDecisions: [
                    {
                        identityId: 'id-300',
                        correlatedIdentityId: 'id-300',
                        identityName: 'Correlated Identity Name',
                        newIdentity: false,
                        submitter: { id: 'rev-3', name: 'Reviewer Three' },
                        account: {
                            id: 'key-1',
                            name: 'Raw Managed Name',
                            sourceName: 'Source Gamma',
                        },
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()

        expect(decisions).toHaveLength(1)
        expect(decisions[0].accountName).toBe('Correlated Identity Name')
    })

    it('uses fallback managed account key when account name matches managed account key exactly', () => {
        const { service } = createService({
            forms: {
                finishedFusionDecisions: [
                    {
                        identityId: 'id-400',
                        newIdentity: true,
                        submitter: { id: 'rev-4', name: 'Reviewer Four' },
                        account: {
                            id: 'key-only',
                            name: 'key-only',
                            sourceName: 'Source Delta',
                        },
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()

        expect(decisions).toHaveLength(1)
        expect(decisions[0].accountName).toBe('key-only')
    })

    it('builds dry-run report stats correctly mapping authoritative, record, and orphan decisions', () => {
        const { service } = createService({
            forms: {
                finishedFusionDecisions: [
                    { newIdentity: false, sourceType: SourceType.Authoritative },
                    { newIdentity: true, sourceType: SourceType.Authoritative },
                    { newIdentity: true, sourceType: SourceType.Record },
                    { newIdentity: true, sourceType: SourceType.Orphan },
                ],
                formsCreated: 4,
                formInstancesCreated: 8,
                formsFound: 4,
                formInstancesFound: 8,
                answeredFormInstancesProcessed: 4,
            },
        })

        const aggregationStats: any = {
            managedAccountsFound: 10,
            totalProcessingTime: '5s',
            managedAccountsFoundAuthoritative: 5,
            managedAccountsFoundRecord: 3,
            managedAccountsFoundOrphan: 2,
            warningSamples: [],
            errorSamples: [],
        }

        const stats = service.buildDryRunStats(aggregationStats)

        expect(stats.fusionReviewNewIdentitiesAuthoritative).toBe(1)
        expect(stats.fusionReviewNoMatchesRecord).toBe(1)
        expect(stats.fusionReviewNoMatchesOrphan).toBe(1)
        expect(stats.fusionReviewDecisionsAuthoritative).toBe(2)
        expect(stats.fusionReviewDecisionsRecord).toBe(1)
        expect(stats.fusionReviewDecisionsOrphan).toBe(1)
        expect(stats.managedAccountsFound).toBe(10)
        expect(stats.managedAccountsFoundAuthoritative).toBe(5)
        expect(stats.managedAccountsFoundRecord).toBe(3)
        expect(stats.managedAccountsFoundOrphan).toBe(2)
    })

    it('preloads reviewer and selected identity objects before rendering decisions', async () => {
        const { service, deps } = createService({
            forms: {
                finishedFusionDecisions: [
                    {
                        id: 'd-preload',
                        identityId: 'id-target',
                        submitter: { id: 'id-reviewer' },
                        account: { id: 'acc-1', sourceName: 'S' },
                    },
                ],
            },
        })

        await service.hydrateIdentitiesForReportDecisions()

        expect(deps.identities.hydrateMissingIdentitiesById).toHaveBeenCalledWith(
            expect.arrayContaining(['id-reviewer', 'id-target'])
        )
    })

    it('delegates dry-run report delivery to email service directly', async () => {
        const { service, deps } = createService()

        const report: any = {
            accounts: [],
            matches: 0,
            totalAccounts: 0,
        }

        const finalDryRunStats: any = {
            totalFusionAccounts: 1,
            fusionAccountsFound: 1,
            fusionReviewsCreated: 0,
            fusionReviewAssignments: 0,
            fusionReviewsFound: 0,
            fusionReviewInstancesFound: 0,
            fusionReviewsProcessed: 0,
            fusionReviewNewIdentities: 0,
            fusionReviewNonMatches: 0,
            fusionReviewDecisionsAuthoritative: 0,
            fusionReviewDecisionsRecord: 0,
            fusionReviewDecisionsOrphan: 0,
            fusionReviewNewIdentitiesAuthoritative: 0,
            fusionReviewNoMatchesRecord: 0,
            fusionReviewNoMatchesOrphan: 0,
            aggregationWarnings: 0,
            aggregationErrors: 0,
            warningSamples: [],
            errorSamples: [],
            usedMemory: '10 MB',
            identitiesFound: 1,
            managedAccountsFound: 1,
            totalProcessingTime: '1s',
            phaseTiming: [],
        }

        await service.writeAndSendDryRunReport({
            report,
            finalDryRunStats,
            sendEmail: ['reviewer@example.com'],
        })

        expect(deps.email.sendEmail).toHaveBeenCalledTimes(1)
    })

    it('hydrates global owner identities before resolving report recipient emails', async () => {
        const fetchGlobalOwnerIdentityIds = vi.fn(async () => ['owner-1'])
        const hydrateMissingIdentitiesById = vi.fn(async () => undefined)
        const getRecipientEmails = vi.fn(async () => ['owner@example.com'])
        const sendEmail = vi.fn(async () => undefined)

        const { service } = createService({
            sources: { fetchGlobalOwnerIdentityIds },
            identities: {
                hydrateMissingIdentitiesById,
                getIdentityById: vi.fn(() => undefined),
            },
            email: { getRecipientEmails, sendEmail },
        })

        await service.sendReport({ accounts: [], matches: 0 } as any, 'aggregation')

        expect(fetchGlobalOwnerIdentityIds).toHaveBeenCalledTimes(1)
        expect(hydrateMissingIdentitiesById).toHaveBeenCalledWith(['owner-1'])
        expect(getRecipientEmails).toHaveBeenCalledWith(['owner-1'])
        expect(sendEmail).toHaveBeenCalledTimes(1)
    })
})

