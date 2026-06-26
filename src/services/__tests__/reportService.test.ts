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
            managedAccountsAllById: new Map<string, any>(),
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
            getFusionIdentity: jest.fn(() => undefined),
            getFusionAccountByNativeIdentity: jest.fn(() => undefined),
            fusionIdentities: [],
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

    it('resolves account name from managed account when decision account name is the composite key', () => {
        const managedAccountsAllById = new Map<string, any>([
            ['source-1::native-1', { id: 'isc-acc-1', name: 'John Smith', sourceId: 'source-1' }],
        ])
        const { service } = createService({
            sources: { managedAccountsAllById },
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: {
                            id: 'source-1::native-1',
                            name: 'source-1::native-1',
                            sourceName: 'HR',
                            sourceId: 'source-1',
                            nativeIdentity: 'native-1',
                        },
                        submitter: { id: 'rev-1', name: 'Reviewer One' },
                        identityId: 'id-new',
                        newIdentity: true,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions[0].accountName).toBe('John Smith')
        expect(decisions[0].accountUrl).toContain('/human-accounts/')
        expect(decisions[0].decision).toBe('create-new-identity')
    })

    it('resolves accountUrl from managed account id when resolveIscAccountIdForManagedKey returns undefined', () => {
        // Production behavior: the account has a distinct ISC id but resolveIscAccountIdForManagedKey
        // returns undefined (e.g. account not loaded in its internal lookup). The second pass
        // must read the id directly from managedAccountsAllById so the link is preserved.
        const managedAccountsAllById = new Map<string, any>([
            [
                'source-1::native-1',
                { id: 'isc-acc-distinct', name: 'John Smith', sourceId: 'source-1', nativeIdentity: 'native-1' },
            ],
        ])
        const { service } = createService({
            sources: {
                managedAccountsAllById,
                resolveIscAccountIdForManagedKey: jest.fn(() => undefined),
            },
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: {
                            id: 'source-1::native-1',
                            name: 'source-1::native-1',
                            sourceName: 'HR',
                            sourceId: 'source-1',
                            nativeIdentity: 'native-1',
                        },
                        submitter: { id: 'rev-1', name: 'Reviewer One' },
                        identityId: 'id-new',
                        newIdentity: true,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions[0].accountUrl).toBeDefined()
        expect(decisions[0].accountUrl).toContain('/human-accounts/isc-acc-distinct')
    })

    it('resolves accountUrl from fusion identity iscAccountId when managed account lookup fails', () => {
        // Production behavior: for a "Created new identity" decision, the managed account
        // may not have a distinct ISC id in the map, but the processed FusionAccount
        // (found via identityId) already has iscAccountId set by addManagedAccountLayer.
        const { service } = createService({
            sources: {
                resolveIscAccountIdForManagedKey: jest.fn(() => undefined),
            },
            fusion: {
                getFusionIdentity: jest.fn((id: string) =>
                    id === 'id-new' ? { iscAccountId: 'isc-from-fusion' } : undefined
                ),
            },
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: {
                            id: 'source-1::native-1',
                            name: 'H. Unknown',
                            sourceName: 'Umbrella Corporation',
                            sourceId: 'source-1',
                            nativeIdentity: 'native-1',
                        },
                        submitter: { id: 'rev-1', name: 'Reviewer One' },
                        identityId: 'id-new',
                        newIdentity: true,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions[0].accountUrl).toBeDefined()
        expect(decisions[0].accountUrl).toContain('/human-accounts/isc-from-fusion')
    })

    it('resolves accountUrl from fusion account map when decision has no identityId', () => {
        // Production behavior: "Created new identity" decisions may not have identityId
        // populated on the decision object, so the FusionAccount must be found by its
        // composite managed key in fusionAccountMap.
        const { service } = createService({
            sources: {
                resolveIscAccountIdForManagedKey: jest.fn(() => undefined),
            },
            fusion: {
                getFusionAccountByNativeIdentity: jest.fn((key: string) =>
                    key === 'source-1::native-1' ? { iscAccountId: 'isc-from-fusion-map' } : undefined
                ),
            },
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: {
                            id: 'source-1::native-1',
                            name: 'H. Unknown',
                            sourceName: 'Umbrella Corporation',
                            sourceId: 'source-1',
                            nativeIdentity: 'native-1',
                        },
                        submitter: { id: 'rev-1', name: 'Reviewer One' },
                        newIdentity: true,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions[0].accountUrl).toBeDefined()
        expect(decisions[0].accountUrl).toContain('/human-accounts/isc-from-fusion-map')
    })

    it('resolves accountUrl by scanning fusionIdentities when account is in identity map without identityId', () => {
        // Production behavior: a "Created new identity" decision may result in a
        // FusionAccount stored in fusionIdentityMap (if identityId was set during
        // processing) even though the decision object itself has no identityId.
        // The code must scan identity accounts by nativeIdentity to find iscAccountId.
        const identityAccounts = [{ nativeIdentity: 'source-1::native-1', iscAccountId: 'isc-from-identity-scan' }]
        const { service } = createService({
            sources: {
                resolveIscAccountIdForManagedKey: jest.fn(() => undefined),
            },
            fusion: {
                getFusionAccountByNativeIdentity: jest.fn(() => undefined),
                get fusionIdentities() {
                    return identityAccounts
                },
            },
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: {
                            id: 'source-1::native-1',
                            name: 'H. Unknown',
                            sourceName: 'Umbrella Corporation',
                            sourceId: 'source-1',
                            nativeIdentity: 'native-1',
                        },
                        submitter: { id: 'rev-1', name: 'Reviewer One' },
                        newIdentity: true,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions[0].accountUrl).toBeDefined()
        expect(decisions[0].accountUrl).toContain('/human-accounts/isc-from-identity-scan')
    })

    it('falls back to composite key for accountUrl when no separate ISC id is available', () => {
        // Regression: when the managed account has no ISC id (record/orphan sources, or
        // accounts whose `id` equals the composite key), the link must still be present
        // using the composite key as the URL segment so reviewers can navigate to the
        // human-accounts page.
        const managedAccountsAllById = new Map<string, any>([
            [
                'source-1::native-1',
                { id: 'source-1::native-1', name: 'John Smith', sourceId: 'source-1', nativeIdentity: 'native-1' },
            ],
        ])
        const { service } = createService({
            sources: {
                managedAccountsAllById,
                resolveIscAccountIdForManagedKey: jest.fn(() => undefined),
            },
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: {
                            id: 'source-1::native-1',
                            name: 'source-1::native-1',
                            sourceName: 'HR',
                            sourceId: 'source-1',
                            nativeIdentity: 'native-1',
                        },
                        submitter: { id: 'rev-1', name: 'Reviewer One' },
                        identityId: 'id-new',
                        newIdentity: true,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions[0].accountUrl).toBeDefined()
        expect(decisions[0].accountUrl).toContain('/human-accounts/')
    })

    it('falls back to composite key only when no managed account name is available', () => {
        const { service } = createService({
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: { id: 'source-x::native-x', name: '', sourceName: 'HR' },
                        submitter: { id: 'rev-1', name: 'Reviewer One' },
                        identityId: 'id-1',
                        newIdentity: true,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions[0].accountName).toBe('source-x::native-x')
    })

    it('does not use raw identityId as selectedIdentityName fallback', () => {
        const { service } = createService({
            identities: {
                getIdentityById: jest.fn(() => undefined),
            },
            forms: {
                finishedFusionDecisions: [
                    {
                        sourceType: SourceType.Authoritative,
                        account: { id: 'acc-1', name: 'Account 1', sourceName: 'source-a' },
                        submitter: { id: 'rev-1', name: 'Reviewer' },
                        identityId: 'id-1',
                        newIdentity: false,
                    },
                ],
            },
        })

        const decisions = service.buildFusionReviewDecisions()
        expect(decisions[0].selectedIdentityName).toBeUndefined()
        expect(decisions[0].selectedIdentityId).toBe('id-1')
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
