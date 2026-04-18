import { dryRun } from '../dryRun'
import { ServiceRegistry } from '../../services/serviceRegistry'

function createRegistry() {
    const timer = {
        phase: jest.fn(),
        end: jest.fn(),
        totalElapsed: jest.fn(() => '1.2s'),
    }

    return {
        config: {
            baseurl: 'https://tenant.example.api.identitynow.com',
        },
        log: {
            info: jest.fn(),
            crash: jest.fn(),
            timer: jest.fn(() => timer),
            getAggregationIssueSummary: jest.fn(() => ({
                warningCount: 1,
                errorCount: 0,
                warningSamples: ['warn-sample'],
                errorSamples: [],
            })),
        },
        sources: {
            managedSources: [{ id: 'src-1' }],
            hasFusionSource: true,
            fusionSourceOwner: { id: 'fusion-owner-1', type: 'IDENTITY' },
            fetchGlobalOwnerIdentityIds: jest.fn().mockResolvedValue(['fusion-owner-1']),
            managedAccountsById: new Map<string, any>([
                ['acc-1', { id: 'acc-1', sourceName: 'HR' }],
                ['acc-2', { id: 'acc-2', sourceName: 'IT' }],
            ]),
            fusionAccountCount: 2,
            fetchAllSources: jest.fn().mockResolvedValue(undefined),
            fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
            fetchManagedAccounts: jest.fn().mockResolvedValue(undefined),
            getSourceByName: jest.fn((name: string) =>
                name === 'IT' ? { sourceType: 'record' } : { sourceType: 'authoritative' }
            ),
            getSourceByNameSafe: jest.fn((name?: string | null) =>
                name ? (name === 'IT' ? { sourceType: 'record' } : { sourceType: 'authoritative' }) : undefined
            ),
            clearManagedAccounts: jest.fn(),
            clearFusionAccounts: jest.fn(),
        },
        identities: {
            identityCount: 10,
            fetchIdentities: jest.fn().mockResolvedValue(undefined),
            getIdentityById: jest.fn((id?: string) => (id ? { id, name: 'Cached' } : undefined)),
            fetchIdentityById: jest.fn().mockResolvedValue({ id: 'fusion-owner-1', name: 'Fusion Owner' }),
            clear: jest.fn(),
        },
        schemas: {
            setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
            fusionIdentityAttribute: 'id',
        },
        fusion: {
            isReset: jest.fn(() => false),
            fusionOwnerIsGlobalReviewer: false,
            fusionReportOnAggregation: false,
            processFusionAccounts: jest.fn().mockResolvedValue(undefined),
            processIdentities: jest.fn().mockResolvedValue(undefined),
            processFusionIdentityDecisions: jest.fn().mockResolvedValue(undefined),
            analyzeUncorrelatedAccounts: jest.fn().mockResolvedValue([]),
            refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
            generateReport: jest.fn((_includeNonMatches: boolean, stats?: Record<string, unknown>) => ({
                accounts: [
                    {
                        accountId: 'acc-1',
                        accountName: 'Alice HR',
                        accountSource: 'HR',
                        fusionIdentityComparisons: 1,
                        matches: [{ identityName: 'Alice', identityId: 'id-1', isMatch: true, scores: [] }],
                    },
                    {
                        accountId: 'acc-2',
                        accountName: 'Bob IT',
                        accountSource: 'IT',
                        fusionIdentityComparisons: 0,
                        matches: [],
                        deferred: true,
                    },
                ],
                fusionReviewDecisions: [
                    {
                        accountId: 'acc-2',
                        accountName: 'Bob IT',
                        accountSource: 'IT',
                        reviewerId: 'rev-1',
                        reviewerName: 'Reviewer One',
                        decision: 'assign-existing-identity',
                        decisionLabel: 'Assign Existing Identity',
                    },
                ],
                stats: { managedAccountsFound: 2, ...stats },
            })),
            totalFusionAccountCount: 2,
            forEachISCAccount: jest.fn(async (send: (account: any) => void) => {
                send({
                    key: 'fusion-1',
                    disabled: false,
                    attributes: {
                        name: 'Fusion One',
                        accounts: ['acc-1'],
                        reviews: [],
                        statuses: ['baseline'],
                    },
                })
                send({
                    key: 'fusion-2',
                    disabled: false,
                    attributes: {
                        name: 'Fusion Two',
                        id: 'id-2',
                        accounts: ['acc-2'],
                        reviews: [],
                        statuses: ['nonMatched'],
                    },
                })
                return 2
            }),
            getISCAccount: jest.fn(async (account: any) => ({
                key: account.key,
                disabled: false,
                attributes: {
                    name: account.name,
                    accounts: account.accounts ?? [],
                    reviews: [],
                    statuses: [],
                },
            })),
            clearAnalyzedAccounts: jest.fn(),
            processManagedAccounts: jest.fn(),
            reconcilePendingFormState: jest.fn(),
        },
        forms: {
            fetchFormData: jest.fn().mockResolvedValue(undefined),
            fetchFormInstancesData: jest.fn().mockResolvedValue(undefined),
            processFetchedFormData: jest.fn().mockResolvedValue(undefined),
            pendingReviewContextByAccountId: new Map<string, any>(),
            cleanUpForms: jest.fn(),
        },
        attributes: {
            initializeCounters: jest.fn().mockResolvedValue(undefined),
            saveState: jest.fn(),
            refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
        },
        messaging: {
            fetchSender: jest.fn().mockResolvedValue(undefined),
            sendReportTo: jest.fn().mockResolvedValue(undefined),
            renderFusionReportHtml: jest.fn(() => '<html><body>dry-run report</body></html>'),
        },
        res: {
            send: jest.fn(),
            keepAlive: jest.fn(),
        },
    } as any
}

describe('dryRun', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('streams enriched rows and sends a final summary object', async () => {
        const registry = createRegistry()

        await dryRun(
            registry,
            { schema: { attributes: [] }, includeMatched: true, includeDeferred: true, includeDecisions: true } as any
        )

        expect(registry.fusion.generateReport).toHaveBeenCalledWith(true, expect.any(Object))
        expect(registry.res.send).toHaveBeenCalledTimes(3)

        const firstRow = registry.res.send.mock.calls[0][0]
        expect(firstRow.matchingStatus.status).toBe('matched')
        expect(firstRow.matchingStatus.matches).toHaveLength(1)
        expect(firstRow.matchingStatus.matchAttempts).toBe(1)
        expect(firstRow.reviewStatus).toEqual({ pendingReviews: false, hasDecisions: false })
        expect(firstRow.sourceStatus).toBeDefined()
        expect(firstRow.correlationStatus).toBeDefined()
        expect(firstRow.correlationStatus.reviews).toBeUndefined()
        expect(firstRow.reportCategories).toEqual(['matched'])
        expect(firstRow.account.attributes.matching).toBeUndefined()

        const secondRow = registry.res.send.mock.calls[1][0]
        expect(secondRow.matchingStatus.status).toBe('deferred')
        expect(secondRow.matchingStatus.matchAttempts).toBe(0)
        expect(secondRow.reviewStatus).toEqual({ pendingReviews: false, hasDecisions: true })
        expect(secondRow.reportCategories).toEqual(['deferred', 'decisions'])
        expect(secondRow.review).toBeDefined()
        // deferred fusion-2 row has accounts=['acc-2'] on the ISC account → correlationStatus present
        expect(secondRow.correlationStatus).toBeDefined()
        expect(secondRow.correlationStatus.reviews).toBeUndefined()

        const summary = registry.res.send.mock.calls[2][0]
        expect(summary.type).toBe('custom:dryrun:summary')
        expect(summary.emitted.totalRows).toBe(2)
        expect(summary.emitted.includeMatched).toBe(1)
        expect(summary.emitted.includeNonMatched).toBeGreaterThanOrEqual(0)
        expect(summary.totals.fusionAccountsTotal).toBe(2)
        expect(summary.totals.fusionAccountsExisting).toBe(2)
    })

    it('fetches fusion owner identity when fusionOwnerIsGlobalReviewer and owner not in cache', async () => {
        const registry = createRegistry()
        registry.sources.fetchGlobalOwnerIdentityIds = jest.fn().mockResolvedValue(['owner-missing-1'])
        registry.fusion.fusionOwnerIsGlobalReviewer = true
        registry.identities.getIdentityById = jest.fn().mockReturnValue(undefined)
        registry.identities.fetchIdentityById = jest.fn().mockResolvedValue({
            id: 'owner-missing-1',
            name: 'Fusion Owner',
        })

        await dryRun(registry, { schema: { attributes: [] }, includeMatched: true } as any)

        expect(registry.identities.fetchIdentityById).toHaveBeenCalledWith('owner-missing-1')
    })

    it('emits synthetic deferred row when deferred managed account id is not on any fusion ISC row', async () => {
        const registry = createRegistry()

        registry.fusion.generateReport.mockImplementation((_includeNonMatches: boolean, stats?: Record<string, unknown>) => ({
            accounts: [
                {
                    accountId: 'acc-orphan-deferred',
                    accountName: 'Orphan Deferred',
                    accountSource: 'HR',
                    sourceType: 'authoritative',
                    deferred: true,
                    fusionIdentityComparisons: 1,
                    matches: [
                        {
                            identityName: 'Peer unmatched',
                            isMatch: true,
                            candidateType: 'new-unmatched',
                            scores: [],
                        },
                    ],
                },
            ],
            fusionReviewDecisions: [],
            stats: { managedAccountsFound: 1, ...stats },
        }))

        registry.fusion.forEachISCAccount.mockImplementation(async (send: (account: any) => void) => {
            send({
                key: 'fusion-other',
                disabled: false,
                attributes: {
                    name: 'Other fusion',
                    accounts: ['acc-1'],
                    reviews: [],
                    statuses: ['baseline'],
                },
            })
        })

        await dryRun(registry, { schema: { attributes: [] }, includeDeferred: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const deferredRow = registry.res.send.mock.calls[0][0]
        expect(deferredRow.matchingStatus.status).toBe('deferred')
        expect(deferredRow.reviewStatus).toEqual({ pendingReviews: false, hasDecisions: false })
        expect(deferredRow.reportCategories).toEqual(['deferred'])
        expect(deferredRow.account.key).toEqual({ simple: { id: 'orphan-deferred:acc-orphan-deferred' } })
        expect(deferredRow.account.attributes.accounts).toEqual(['acc-orphan-deferred'])
        // Orphan deferred stubs have no ISC correlation context — correlationStatus should be absent
        expect(deferredRow.correlationStatus).toBeUndefined()

        const summary = registry.res.send.mock.calls[1][0]
        expect(summary.type).toBe('custom:dryrun:summary')
        expect(summary.emitted.totalRows).toBe(1)
        expect(summary.emitted.includeDeferred).toBe(1)
        expect(summary.totals.deferredMatches).toBe(1)
    })

    it('emits no account rows when no include option is selected', async () => {
        const registry = createRegistry()

        await dryRun(registry, { schema: { attributes: [] } } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(1)
        const summary = registry.res.send.mock.calls[0][0]
        expect(summary.type).toBe('custom:dryrun:summary')
        expect(summary.emitted.totalRows).toBe(0)
    })

    it('always sends summary even when summary input is false', async () => {
        const registry = createRegistry()

        await dryRun(registry, { schema: { attributes: [] }, includeMatched: true, summary: false } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const secondRow = registry.res.send.mock.calls[1][0]
        expect(firstRow.type).toBeUndefined()
        expect(secondRow.type).toBe('custom:dryrun:summary')
    })

    it('ignores legacy runtime options and emits no rows without include* flags', async () => {
        const registry = createRegistry()

        await dryRun(
            registry,
            { schema: { attributes: [] }, onlyMatching: true, onlyReview: true, limit: 1, summary: true } as any
        )

        expect(registry.res.send).toHaveBeenCalledTimes(1)
        const summary = registry.res.send.mock.calls[0][0]
        expect(summary.type).toBe('custom:dryrun:summary')
        expect(summary.emitted.totalRows).toBe(0)
    })

    it('filters rows to matched entries when includeMatched is true', async () => {
        const registry = createRegistry()

        await dryRun(registry, { schema: { attributes: [] }, includeMatched: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const summary = registry.res.send.mock.calls[1][0]
        expect(firstRow.matchingStatus.status).toBe('matched')
        expect(summary.type).toBe('custom:dryrun:summary')
        expect(summary.emitted.totalRows).toBe(1)
        expect(summary.emitted.includeMatched).toBe(1)
        expect(summary.emitted.includeNonMatched).toBe(0)
    })

    it('filters rows to exact-match entries when includeExact is true', async () => {
        const registry = createRegistry()
        registry.sources.managedAccountsById.set('acc-3', { id: 'acc-3', sourceName: 'HR' })

        registry.fusion.generateReport.mockImplementation((_includeNonMatches: boolean, stats?: Record<string, unknown>) => ({
            accounts: [
                {
                    accountId: 'acc-1',
                    accountName: 'Alice HR',
                    accountSource: 'HR',
                    fusionIdentityComparisons: 1,
                    matches: [
                        {
                            identityName: 'Alice',
                            identityId: 'id-1',
                            isMatch: true,
                            scores: [
                                { algorithm: 'jaro-winkler', score: 100, skipped: false },
                                { algorithm: 'name-matcher', score: 100, skipped: false },
                            ],
                        },
                    ],
                },
                {
                    accountId: 'acc-2',
                    accountName: 'Bob IT',
                    accountSource: 'IT',
                    fusionIdentityComparisons: 0,
                    matches: [],
                    deferred: true,
                },
                {
                    accountId: 'acc-3',
                    accountName: 'Charlie HR',
                    accountSource: 'HR',
                    fusionIdentityComparisons: 1,
                    matches: [
                        {
                            identityName: 'Charlie',
                            identityId: 'id-3',
                            isMatch: true,
                            scores: [{ algorithm: 'jaro-winkler', score: 90, skipped: false }],
                        },
                    ],
                },
            ],
            fusionReviewDecisions: [
                {
                    accountId: 'acc-2',
                    accountName: 'Bob IT',
                    accountSource: 'IT',
                    reviewerId: 'rev-1',
                    reviewerName: 'Reviewer One',
                    decision: 'assign-existing-identity',
                    decisionLabel: 'Assign Existing Identity',
                },
            ],
            stats: { managedAccountsFound: 3, ...stats },
        }))

        registry.fusion.forEachISCAccount.mockImplementation(async (send: (account: any) => void) => {
            send({
                key: 'fusion-1',
                disabled: false,
                attributes: {
                    name: 'Fusion One',
                    accounts: ['acc-1'],
                    reviews: [],
                    statuses: ['baseline'],
                },
            })
            send({
                key: 'fusion-2',
                disabled: false,
                attributes: {
                    name: 'Fusion Two',
                    accounts: ['acc-2'],
                    reviews: [],
                    statuses: ['nonMatched'],
                },
            })
            send({
                key: 'fusion-3',
                disabled: false,
                attributes: {
                    name: 'Fusion Three',
                    accounts: ['acc-3'],
                    reviews: [],
                    statuses: [],
                },
            })
            return 3
        })

        await dryRun(registry, { schema: { attributes: [] }, includeExact: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        expect(firstRow.matchingStatus.status).toBe('matched')
        expect(firstRow.reportCategories).toEqual(['exact'])
        const summary = registry.res.send.mock.calls[1][0]
        expect(summary.emitted.includeExact).toBe(1)
        expect(summary.emitted.includeMatched).toBe(0)
        expect(summary.emitted.totalRows).toBe(1)
    })

    it('filters rows to pending review entries when includeReview is true', async () => {
        const registry = createRegistry()
        registry.forms.pendingReviewContextByAccountId = new Map<string, any>([
            [
                'acc-1',
                {
                    forms: [{ formInstanceId: 'fi-1', url: 'https://review/link' }],
                    reviewers: [{ id: 'rev-1', name: 'Reviewer One', email: 'reviewer.one@example.com' }],
                    candidateIds: ['id-1'],
                },
            ],
        ])

        await dryRun(registry, { schema: { attributes: [] }, includeReview: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const summary = registry.res.send.mock.calls[1][0]
        expect(firstRow.review.pending).toBe(true)
        expect(firstRow.review.forms).toHaveLength(1)
        expect(firstRow.review.reviewers).toHaveLength(1)
        expect(firstRow.reviewStatus).toEqual({ pendingReviews: true, hasDecisions: false })
        expect(summary.emitted.totalRows).toBe(1)
    })

    it('filters rows to analysis non-matches when includeNonMatched is true', async () => {
        const registry = createRegistry()

        await dryRun(registry, { schema: { attributes: [] }, includeNonMatched: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const summary = registry.res.send.mock.calls[1][0]
        expect(firstRow.reportCategories).toContain('nonMatched')
        expect(firstRow.review).toBeUndefined()
        expect(summary.emitted.totalRows).toBe(1)
    })

    it('groups output rows by selected category order and deduplicates rows', async () => {
        const registry = createRegistry()
        registry.forms.pendingReviewContextByAccountId = new Map<string, any>([
            [
                'acc-2',
                {
                    forms: [{ formInstanceId: 'fi-2', url: 'https://review/link/2' }],
                    reviewers: [{ id: 'rev-2', name: 'Reviewer Two', email: 'reviewer.two@example.com' }],
                    candidateIds: ['id-2'],
                },
            ],
        ])

        await dryRun(
            registry,
            {
                schema: { attributes: [] },
                includeExisting: true,
                includeNonMatched: true,
                includeDeferred: true,
                includeReview: true,
                includeDecisions: true,
            } as any
        )

        expect(registry.res.send).toHaveBeenCalledTimes(3)
        // CATEGORY_ORDER emits nonMatched before existing-fusion; second fusion row is in the nonMatched group first.
        const firstRow = registry.res.send.mock.calls[0][0]
        const secondRow = registry.res.send.mock.calls[1][0]
        const summary = registry.res.send.mock.calls[2][0]

        expect(firstRow.reportCategories).toEqual([
            'nonMatched',
            'deferred',
            'review',
            'decisions',
            'existing-fusion',
        ])
        expect(secondRow.reportCategories).toEqual(['existing-fusion'])
        expect(firstRow.review).toBeDefined()
        expect(secondRow.review).toBeUndefined()
        expect(summary.emitted.totalRows).toBe(2)
        expect(summary.emitted.includeDeferred).toBe(1)
        expect(summary.emitted.includeExisting).toBe(summary.totals.fusionAccountsExisting)
    })

    it('does not execute persistence paths from std:account:list', async () => {
        const registry = createRegistry()

        await dryRun(registry, { schema: { attributes: [] }, includeMatched: true, includeDeferred: true } as any)

        expect(registry.forms.fetchFormInstancesData).toHaveBeenCalled()
        expect(registry.forms.processFetchedFormData).toHaveBeenCalled()
        expect(registry.fusion.refreshUniqueAttributes).toHaveBeenCalled()
        expect(registry.forms.cleanUpForms).not.toHaveBeenCalled()
        expect(registry.attributes.saveState).not.toHaveBeenCalled()
        expect(registry.fusion.processManagedAccounts).toHaveBeenCalled()
    })

    it('fails when fusion source is unavailable', async () => {
        const registry = createRegistry()
        registry.sources.hasFusionSource = false

        await dryRun(registry, { schema: { attributes: [] }, includeMatched: true, includeDeferred: true } as any)

        expect(registry.log.crash).toHaveBeenCalledWith(
            'Failed to run custom:dryrun',
            expect.objectContaining({
                message:
                    'Fusion source not found. The connector instance could not locate its own source in ISC. Verify the connector is properly deployed.',
            })
        )
        expect(registry.sources.fetchFusionAccounts).not.toHaveBeenCalled()
        expect(registry.res.send).not.toHaveBeenCalled()
    })

    it('sends report email to explicit recipients even when report candidates have no identityId', async () => {
        const registry = createRegistry()
        registry.fusion.generateReport.mockImplementation((_includeNonMatches: boolean, stats?: Record<string, unknown>) => ({
            accounts: [
                {
                    accountId: 'acc-no-identity-match',
                    accountName: 'No Identity Match',
                    accountSource: 'HR',
                    fusionIdentityComparisons: 1,
                    matches: [{ identityName: 'Unknown Candidate', isMatch: true, scores: [] }],
                },
            ],
            fusionReviewDecisions: [],
            stats: { managedAccountsFound: 1, ...stats },
        }))

        await dryRun(
            registry,
            {
                schema: { attributes: [] },
                includeMatched: true,
                sendReportTo: [' reviewer.one@example.com ', 'reviewer.two@example.com'],
            } as any
        )

        expect(registry.messaging.fetchSender).toHaveBeenCalledTimes(1)
        expect(registry.messaging.sendReportTo).toHaveBeenCalledWith(expect.any(Object), {
            recipients: ['reviewer.one@example.com', 'reviewer.two@example.com'],
            reportType: 'aggregation',
            reportTitle: 'Identity Fusion Dry Run Report',
        })
    })


    it('writes a pretty JSON array detail file and returns only the summary when writeToDisk is true', async () => {
        const fs = await import('fs')
        const registry = createRegistry()

        await dryRun(registry, { schema: { attributes: [] }, includeNonMatched: true, writeToDisk: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(1)
        const summary = registry.res.send.mock.calls[0][0]
        expect(summary.type).toBe('custom:dryrun:summary')
        expect(summary.writeToDisk).toBe(true)
        expect(summary.reportOutputPath).toBeDefined()
        expect(summary.reportHtmlOutputPath).toBeDefined()
        expect(String(summary.reportOutputPath)).toMatch(
            /reports[\\/]custom-report-tenant-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/
        )
        expect(String(summary.reportHtmlOutputPath)).toMatch(
            /reports[\\/]dry-run-tenant-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.html$/
        )

        const raw = fs.readFileSync(summary.reportOutputPath, 'utf8')
        const body = JSON.parse(raw) as { rows: unknown[]; summary: { type?: string } }
        expect(Object.keys(body)[0]).toBe('summary')
        expect(Array.isArray(body.rows)).toBe(true)
        expect(body.rows.length).toBeGreaterThanOrEqual(1)
        expect((body.rows[0] as any).account).toBeDefined()
        expect(body.summary?.type).toBe('custom:dryrun:summary')
        expect(body.summary).toMatchObject({ emitted: expect.any(Object), totals: expect.any(Object) })
        expect(fs.readFileSync(summary.reportHtmlOutputPath, 'utf8')).toContain('dry-run report')

        fs.unlinkSync(summary.reportOutputPath)
        fs.unlinkSync(summary.reportHtmlOutputPath)
    })
})
