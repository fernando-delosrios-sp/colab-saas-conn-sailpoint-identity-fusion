import { customReport } from '../customReport'
import { ServiceRegistry } from '../../services/serviceRegistry'

function createRegistry() {
    const timer = {
        phase: jest.fn(),
        end: jest.fn(),
        totalElapsed: jest.fn(() => '1.2s'),
    }

    return {
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
            clearManagedAccounts: jest.fn(),
            clearFusionAccounts: jest.fn(),
        },
        identities: {
            identityCount: 10,
            fetchIdentities: jest.fn().mockResolvedValue(undefined),
            clear: jest.fn(),
        },
        schemas: {
            setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
        },
        fusion: {
            processFusionAccounts: jest.fn().mockResolvedValue(undefined),
            processIdentities: jest.fn().mockResolvedValue(undefined),
            analyzeManagedAccounts: jest.fn().mockResolvedValue([]),
            refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
            generateReport: jest.fn(() => ({
                accounts: [
                    {
                        accountId: 'acc-1',
                        accountName: 'Alice HR',
                        accountSource: 'HR',
                        matches: [{ identityName: 'Alice', identityId: 'id-1', isMatch: true, scores: [] }],
                    },
                    {
                        accountId: 'acc-2',
                        accountName: 'Bob IT',
                        accountSource: 'IT',
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
                stats: { managedAccountsFound: 2 },
            })),
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
                        accounts: ['acc-2'],
                        reviews: [],
                        statuses: ['unmatched'],
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
        },
        forms: {
            fetchFormData: jest.fn().mockResolvedValue(undefined),
            pendingReviewContextByAccountId: new Map<string, any>(),
            cleanUpForms: jest.fn(),
        },
        attributes: {
            saveState: jest.fn(),
            refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
        },
        res: {
            send: jest.fn(),
        },
    } as any
}

describe('customReport', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('streams enriched rows and sends a final summary object', async () => {
        const registry = createRegistry()

        await customReport(
            registry,
            { schema: { attributes: [] }, includeMatched: true, includeDeferred: true, includeDecisions: true } as any
        )

        expect(registry.fusion.generateReport).toHaveBeenCalledWith(true, expect.any(Object))
        expect(registry.res.send).toHaveBeenCalledTimes(3)

        const firstRow = registry.res.send.mock.calls[0][0]
        expect(firstRow.matchingStatus.status).toBe('matched')
        expect(firstRow.matchingStatus.matches).toHaveLength(1)
        expect(firstRow.sourceStatus).toBeDefined()
        expect(firstRow.correlationStatus).toBeDefined()
        expect(firstRow.reportCategories).toEqual(['matched'])
        expect(firstRow.account.attributes.matching).toBeUndefined()

        const secondRow = registry.res.send.mock.calls[1][0]
        expect(secondRow.matchingStatus.status).toBe('deferred')
        expect(secondRow.reportCategories).toEqual(['deferred', 'decisions'])
        expect(secondRow.review).toBeDefined()

        const summary = registry.res.send.mock.calls[2][0]
        expect(summary.type).toBe('custom:report:summary')
        expect(summary.rows.sent).toBe(2)
        expect(summary.rows.matched).toBe(1)
        expect(summary.rows.nonMatched).toBe(0)
    })

    it('emits no account rows when no include option is selected', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] } } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(1)
        const summary = registry.res.send.mock.calls[0][0]
        expect(summary.type).toBe('custom:report:summary')
        expect(summary.rows.sent).toBe(0)
    })

    it('always sends summary even when summary input is false', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] }, includeMatched: true, summary: false } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const secondRow = registry.res.send.mock.calls[1][0]
        expect(firstRow.type).toBeUndefined()
        expect(secondRow.type).toBe('custom:report:summary')
    })

    it('ignores legacy runtime options and emits no rows without include* flags', async () => {
        const registry = createRegistry()

        await customReport(
            registry,
            { schema: { attributes: [] }, onlyMatching: true, onlyReview: true, limit: 1, summary: true } as any
        )

        expect(registry.res.send).toHaveBeenCalledTimes(1)
        const summary = registry.res.send.mock.calls[0][0]
        expect(summary.type).toBe('custom:report:summary')
        expect(summary.rows.sent).toBe(0)
    })

    it('filters rows to matched entries when includeMatched is true', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] }, includeMatched: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const summary = registry.res.send.mock.calls[1][0]
        expect(firstRow.matchingStatus.status).toBe('matched')
        expect(summary.type).toBe('custom:report:summary')
        expect(summary.rows.sent).toBe(1)
        expect(summary.rows.matched).toBe(1)
        expect(summary.rows.nonMatched).toBe(0)
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

        await customReport(registry, { schema: { attributes: [] }, includeReview: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const summary = registry.res.send.mock.calls[1][0]
        expect(firstRow.review.pending).toBe(true)
        expect(firstRow.review.forms).toHaveLength(1)
        expect(firstRow.review.reviewers).toHaveLength(1)
        expect(summary.rows.sent).toBe(1)
    })

    it('filters rows to analysis non-matches when includeUnmatched is true', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] }, includeUnmatched: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const summary = registry.res.send.mock.calls[1][0]
        expect(firstRow.reportCategories).toContain('unmatched')
        expect(firstRow.review).toBeUndefined()
        expect(summary.rows.sent).toBe(1)
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

        await customReport(
            registry,
            {
                schema: { attributes: [] },
                includeBaseline: true,
                includeUnmatched: true,
                includeDeferred: true,
                includeReview: true,
                includeDecisions: true,
            } as any
        )

        expect(registry.res.send).toHaveBeenCalledTimes(3)
        const firstRow = registry.res.send.mock.calls[0][0]
        const secondRow = registry.res.send.mock.calls[1][0]
        const summary = registry.res.send.mock.calls[2][0]

        expect(firstRow.reportCategories).toEqual(['baseline'])
        expect(secondRow.reportCategories).toEqual(['unmatched', 'deferred', 'review', 'decisions'])
        expect(firstRow.review).toBeUndefined()
        expect(secondRow.review).toBeDefined()
        expect(summary.rows.sent).toBe(2)
        expect(summary.rows.deferred).toBe(1)
    })

    it('does not execute persistence paths from std:account:list', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] }, includeMatched: true, includeDeferred: true } as any)

        expect(registry.forms.fetchFormData).toHaveBeenCalled()
        expect(registry.fusion.refreshUniqueAttributes).toHaveBeenCalled()
        expect(registry.forms.cleanUpForms).not.toHaveBeenCalled()
        expect(registry.attributes.saveState).not.toHaveBeenCalled()
        expect(registry.fusion.processManagedAccounts).not.toHaveBeenCalled()
    })

    it('continues when fusion source is unavailable', async () => {
        const registry = createRegistry()
        registry.sources.hasFusionSource = false

        await customReport(registry, { schema: { attributes: [] }, includeMatched: true, includeDeferred: true } as any)

        expect(registry.sources.fetchFusionAccounts).not.toHaveBeenCalled()
        expect(registry.res.send).toHaveBeenCalled()
    })

    it('falls back to analyzed managed accounts when forEach emits no rows', async () => {
        const registry = createRegistry()
        registry.fusion.forEachISCAccount.mockResolvedValue(0)
        registry.fusion.analyzeManagedAccounts.mockResolvedValue([
            { key: 'managed-1', name: 'Managed One', accounts: ['acc-1'] },
            { key: 'managed-2', name: 'Managed Two', accounts: ['acc-2'] },
        ])

        await customReport(registry, { schema: { attributes: [] }, includeMatched: true, includeDeferred: true } as any)

        expect(registry.attributes.refreshUniqueAttributes).toHaveBeenCalledTimes(2)
        expect(registry.fusion.getISCAccount).toHaveBeenCalledTimes(2)
        expect(registry.res.send).toHaveBeenCalledTimes(3)
        const firstRow = registry.res.send.mock.calls[0][0]
        expect(firstRow.matchingStatus).toBeDefined()
        expect(firstRow.account).toBeDefined()
    })
})
