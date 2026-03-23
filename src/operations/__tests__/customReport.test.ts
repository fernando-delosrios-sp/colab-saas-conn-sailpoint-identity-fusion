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
                        statuses: [],
                    },
                })
                send({
                    key: 'fusion-2',
                    disabled: false,
                    attributes: {
                        name: 'Fusion Two',
                        accounts: ['acc-2'],
                        reviews: [],
                        statuses: [],
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

        await customReport(registry, { schema: { attributes: [] } } as any)

        expect(registry.fusion.generateReport).toHaveBeenCalledWith(true, expect.any(Object))
        expect(registry.res.send).toHaveBeenCalledTimes(3)

        const firstRow = registry.res.send.mock.calls[0][0]
        expect(firstRow.attributes.matching.status).toBe('matched')
        expect(firstRow.attributes.matching.matches).toHaveLength(1)

        const secondRow = registry.res.send.mock.calls[1][0]
        expect(secondRow.attributes.matching.status).toBe('non-matched')

        const summary = registry.res.send.mock.calls[2][0]
        expect(summary.type).toBe('custom:report:summary')
        expect(summary.rows.sent).toBe(2)
        expect(summary.rows.matched).toBe(1)
        expect(summary.rows.nonMatched).toBe(1)
    })

    it('applies limit option to streamed account rows', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] }, limit: 1 } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        expect(firstRow.type).toBeUndefined()
        const summary = registry.res.send.mock.calls[1][0]
        expect(summary.type).toBe('custom:report:summary')
        expect(summary.rows.sent).toBe(1)
    })

    it('skips summary payload when summary option is false', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] }, summary: false } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const secondRow = registry.res.send.mock.calls[1][0]
        expect(firstRow.type).toBeUndefined()
        expect(secondRow.type).toBeUndefined()
    })

    it('filters rows to matched entries when onlyMatching is true', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] }, onlyMatching: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const summary = registry.res.send.mock.calls[1][0]
        expect(firstRow.attributes.matching.status).toBe('matched')
        expect(summary.type).toBe('custom:report:summary')
        expect(summary.rows.sent).toBe(1)
        expect(summary.rows.matched).toBe(1)
        expect(summary.rows.nonMatched).toBe(0)
    })

    it('filters rows to pending review entries when onlyReview is true', async () => {
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

        await customReport(registry, { schema: { attributes: [] }, onlyReview: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(2)
        const firstRow = registry.res.send.mock.calls[0][0]
        const summary = registry.res.send.mock.calls[1][0]
        expect(firstRow.attributes.review.pending).toBe(true)
        expect(firstRow.attributes.review.forms).toHaveLength(1)
        expect(firstRow.attributes.review.reviewers).toHaveLength(1)
        expect(summary.rows.sent).toBe(1)
    })

    it('includes matched or pending-review rows when onlyMatching and onlyReview are true', async () => {
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

        await customReport(registry, { schema: { attributes: [] }, onlyMatching: true, onlyReview: true } as any)

        expect(registry.res.send).toHaveBeenCalledTimes(3)
        const firstRow = registry.res.send.mock.calls[0][0]
        const secondRow = registry.res.send.mock.calls[1][0]
        const summary = registry.res.send.mock.calls[2][0]

        expect(firstRow.attributes.matching.status).toBe('matched')
        expect(firstRow.attributes.review.pending).toBe(false)
        expect(secondRow.attributes.matching.status).toBe('non-matched')
        expect(secondRow.attributes.review.pending).toBe(true)
        expect(summary.rows.sent).toBe(2)
        expect(summary.rows.matched).toBe(1)
        expect(summary.rows.nonMatched).toBe(1)
    })

    it('does not execute persistence paths from std:account:list', async () => {
        const registry = createRegistry()

        await customReport(registry, { schema: { attributes: [] } } as any)

        expect(registry.forms.fetchFormData).toHaveBeenCalled()
        expect(registry.fusion.refreshUniqueAttributes).toHaveBeenCalled()
        expect(registry.forms.cleanUpForms).not.toHaveBeenCalled()
        expect(registry.attributes.saveState).not.toHaveBeenCalled()
        expect(registry.fusion.processManagedAccounts).not.toHaveBeenCalled()
    })

    it('continues when fusion source is unavailable', async () => {
        const registry = createRegistry()
        registry.sources.hasFusionSource = false

        await customReport(registry, { schema: { attributes: [] } } as any)

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

        await customReport(registry, { schema: { attributes: [] } } as any)

        expect(registry.attributes.refreshUniqueAttributes).toHaveBeenCalledTimes(2)
        expect(registry.fusion.getISCAccount).toHaveBeenCalledTimes(2)
        expect(registry.res.send).toHaveBeenCalledTimes(3)
        const firstRow = registry.res.send.mock.calls[0][0]
        expect(firstRow.attributes.matching).toBeDefined()
    })
})
