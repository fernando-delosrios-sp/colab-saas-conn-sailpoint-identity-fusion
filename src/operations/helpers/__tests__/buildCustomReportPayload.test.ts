import {
    buildCustomReportSummary,
    buildReportAccountIndex,
    createCustomReportRowCounter,
    enrichISCAccountWithMatching,
} from '../buildCustomReportPayload'

describe('buildCustomReportPayload', () => {
    it('enriches account rows with matching payload derived from report accounts', () => {
        const reportIndex = buildReportAccountIndex([
            {
                accountId: 'acc-1',
                accountName: 'Alice HR',
                accountSource: 'HR',
                sourceType: 'authoritative',
                matches: [{ identityName: 'Alice', identityId: 'id-1', isMatch: true, scores: [] }],
            },
        ])

        const row = {
            key: 'fusion-1',
            disabled: false,
            attributes: {
                accounts: ['acc-1'],
                missingAccounts: [],
                reviews: ['review-1'],
                statuses: ['active'],
            },
        } as any

        const pendingReviewByAccountId = new Map<string, any>([
            [
                'acc-1',
                {
                    forms: [{ formInstanceId: 'fi-1', url: 'https://review/form/1' }],
                    reviewers: [{ id: 'rev-1', name: 'Reviewer 1', email: 'reviewer1@example.com' }],
                    candidateIds: ['id-1'],
                },
            ],
        ])

        const enriched = enrichISCAccountWithMatching(row, reportIndex, pendingReviewByAccountId)
        const matching = (enriched.account as any).attributes.matching
        expect(enriched.status).toBe('matched')
        expect(matching.analyzedAccounts).toBe(1)
        expect(matching.matches).toHaveLength(1)
        expect((enriched.account as any).attributes.review.pending).toBe(true)
        expect((enriched.account as any).attributes.review.forms).toEqual([
            { formInstanceId: 'fi-1', url: 'https://review/form/1' },
        ])
        expect((enriched.account as any).attributes.review.reviewers).toEqual([
            { id: 'rev-1', name: 'Reviewer 1', email: 'reviewer1@example.com' },
        ])
        expect((enriched.account as any).attributes.review.candidates).toEqual([
            { id: 'id-1', name: 'Alice', scores: [], attributes: {} },
        ])
    })

    it('marks rows without linked analyzed accounts as not-analyzed', () => {
        const reportIndex = buildReportAccountIndex([])
        const row = {
            key: 'fusion-2',
            disabled: false,
            attributes: {
                accounts: ['acc-404'],
                statuses: [],
                reviews: [],
            },
        } as any

        const enriched = enrichISCAccountWithMatching(row, reportIndex)
        const matching = (enriched.account as any).attributes.matching
        expect(enriched.status).toBe('not-analyzed')
        expect(matching.matches).toEqual([])
        expect((enriched.account as any).attributes.review).toEqual({
            pending: false,
            forms: [],
            reviewers: [],
            candidates: [],
        })
    })

    it('deduplicates forms and reviewers across related account ids', () => {
        const reportIndex = buildReportAccountIndex([])
        const row = {
            key: 'fusion-review-multi',
            disabled: false,
            attributes: {
                accounts: ['acc-1', 'acc-2'],
            },
        } as any
        const pendingReviewByAccountId = new Map<string, any>([
            [
                'acc-1',
                {
                    forms: [{ formInstanceId: 'fi-1', url: 'https://review/form/1' }],
                    reviewers: [{ id: 'rev-1', name: 'Reviewer 1', email: 'reviewer1@example.com' }],
                    candidateIds: ['id-1'],
                },
            ],
            [
                'acc-2',
                {
                    forms: [
                        { formInstanceId: 'fi-1', url: 'https://review/form/1' },
                        { formInstanceId: 'fi-2', url: 'https://review/form/2' },
                    ],
                    reviewers: [
                        { id: 'rev-1', name: 'Reviewer 1', email: 'reviewer1@example.com' },
                        { id: 'rev-2', name: 'Reviewer 2', email: 'reviewer2@example.com' },
                    ],
                    candidateIds: ['id-2'],
                },
            ],
        ])

        const enriched = enrichISCAccountWithMatching(row, reportIndex, pendingReviewByAccountId)
        const review = (enriched.account as any).attributes.review

        expect(review.pending).toBe(true)
        expect(review.forms).toHaveLength(2)
        expect(review.reviewers).toHaveLength(2)
        expect(review.candidates).toHaveLength(2)
    })

    it('builds a summary object from counters and report diagnostics', () => {
        const rowCounter = createCustomReportRowCounter()
        rowCounter.matched = 2
        rowCounter['non-matched'] = 1

        const summary = buildCustomReportSummary({
            sentRows: 3,
            rowCounter,
            reportAccounts: [
                { accountId: 'acc-1', accountName: 'A', accountSource: 'HR', matches: [] },
                { accountId: 'acc-2', accountName: 'B', accountSource: 'IT', matches: [{ identityName: 'X', isMatch: true }] },
            ],
            issueSummary: {
                warningCount: 1,
                errorCount: 0,
                warningSamples: ['warn'],
                errorSamples: [],
            },
            totalProcessingTime: '1.1s',
            stats: { managedAccountsFound: 2 },
        })

        expect(summary.type).toBe('custom:report:summary')
        expect(summary.rows.sent).toBe(3)
        expect(summary.managedAccounts.analyzed).toBe(2)
        expect(summary.diagnostics.warnings).toBe(1)
    })
})
