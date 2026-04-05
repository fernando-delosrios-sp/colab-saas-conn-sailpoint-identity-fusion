import {
    buildDryRunSummary,
    buildReportAccountIndex,
    createDryRunOptionEmitCounter,
    enrichISCAccountWithMatching,
} from '../buildDryRunPayload'

describe('buildDryRunPayload', () => {
    it('enriches account rows with matching payload derived from report accounts', () => {
        const reportIndex = buildReportAccountIndex([
            {
                accountId: 'acc-1',
                accountName: 'Alice HR',
                accountSource: 'HR',
                sourceType: 'authoritative',
                fusionIdentityComparisons: 1,
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
        expect(matching.matchAttempts).toBe(1)
        expect(matching.matchedAccounts).toBe(1)
        expect(matching.matches).toHaveLength(1)
        expect(matching.correlationContext).toEqual({
            accounts: ['acc-1'],
            missingAccounts: [],
            statuses: ['active'],
        })
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

    it('marks rows without linked match attempts as not-analyzed', () => {
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

    it('marks rows as deferred when report account is deferred', () => {
        const reportIndex = buildReportAccountIndex([
            {
                accountId: 'acc-deferred-1',
                accountName: 'Deferred Account',
                accountSource: 'HR',
                sourceType: 'authoritative',
                deferred: true,
                fusionIdentityComparisons: 2,
                matches: [{ identityName: 'Unmatched Candidate', isMatch: true, candidateType: 'new-unmatched', scores: [] }],
            },
        ])
        const row = {
            key: 'fusion-deferred-1',
            disabled: false,
            attributes: {
                accounts: ['acc-deferred-1'],
                statuses: [],
                reviews: [],
            },
        } as any

        const enriched = enrichISCAccountWithMatching(row, reportIndex)
        expect(enriched.status).toBe('deferred')
        expect((enriched.account as any).attributes.matching.matchAttempts).toBe(2)
        expect((enriched.account as any).attributes.matching.matches[0].candidateType).toBe('deferred')
    })

    it('merges unique forms and reviewers across related account ids', () => {
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

    const defaultReportOptions = {
        includeExisting: false,
        includeNonMatched: true,
        includeMatched: true,
        includeExact: false,
        includeDeferred: true,
        includeReview: false,
        includeDecisions: false,
        writeToDisk: false,
    }

    it('builds a summary object from option emit counts, options mirror, and report diagnostics', () => {
        const optionEmitCounter = createDryRunOptionEmitCounter()
        optionEmitCounter.includeMatched = 2
        optionEmitCounter.includeDeferred = 1
        optionEmitCounter.includeNonMatched = 1

        const summary = buildDryRunSummary({
            sentRows: 3,
            optionEmitCounter,
            reportOptions: defaultReportOptions,
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

        expect(summary.type).toBe('custom:dryrun:summary')
        expect(summary.options).toEqual(defaultReportOptions)
        expect(summary.emitted.totalRows).toBe(3)
        expect(summary.emitted.includeDeferred).toBe(1)
        expect(summary.emitted.includeMatched).toBe(2)
        expect(summary.emitted.includeNonMatched).toBe(1)
        expect(summary.emitted.includeExact).toBe(0)
        expect(summary.totals.matchAttempts).toBe(2)
        expect(summary.diagnostics.warnings).toBe(1)
        expect(summary.totals.fusionAccountsTotal).toBe(0)
        expect(summary.totals.matches).toBe(1)
        expect(summary.totals.nonMatches).toBe(1)
        expect(summary.totals.deferredMatches).toBe(0)
    })

    it('sets emitted.includeExisting to fusionAccountsExisting when includeExisting option is true', () => {
        const optionEmitCounter = createDryRunOptionEmitCounter()
        const summary = buildDryRunSummary({
            sentRows: 2,
            optionEmitCounter,
            reportOptions: { ...defaultReportOptions, includeExisting: true, includeNonMatched: false },
            reportAccounts: [],
            issueSummary: {
                warningCount: 0,
                errorCount: 0,
                warningSamples: [],
                errorSamples: [],
            },
            totalProcessingTime: '0.5s',
            stats: { fusionAccountsFound: 5133, totalFusionAccounts: 5133 },
        })

        expect(summary.totals.fusionAccountsExisting).toBe(5133)
        expect(summary.emitted.includeExisting).toBe(5133)
        expect(summary.emitted.includeExisting).toBe(summary.totals.fusionAccountsExisting)
    })

    it('counts deferred rows that still have matches', () => {
        const optionEmitCounter = createDryRunOptionEmitCounter()
        const summary = buildDryRunSummary({
            sentRows: 1,
            optionEmitCounter,
            reportOptions: defaultReportOptions,
            reportAccounts: [
                {
                    accountId: 'd1',
                    accountName: 'D',
                    accountSource: 'HR',
                    deferred: true,
                    matches: [{ identityName: 'Cand', isMatch: true, scores: [] }],
                },
            ],
            issueSummary: {
                warningCount: 0,
                errorCount: 0,
                warningSamples: [],
                errorSamples: [],
            },
            totalProcessingTime: '0s',
        })
        expect(summary.totals.matches).toBe(0)
        expect(summary.totals.deferredMatches).toBe(1)
        expect(summary.totals.matchAttempts).toBe(1)
    })

    it('includes disk output path and totals when writeToDisk is requested', () => {
        const optionEmitCounter = createDryRunOptionEmitCounter()
        const summary = buildDryRunSummary({
            sentRows: 5,
            optionEmitCounter,
            reportOptions: { ...defaultReportOptions, writeToDisk: true },
            reportAccounts: [],
            issueSummary: {
                warningCount: 0,
                errorCount: 0,
                warningSamples: [],
                errorSamples: [],
            },
            totalProcessingTime: '0s',
            writeToDisk: true,
            reportOutputPath: '/tmp/identity-fusion-custom-report/custom-report.json',
        })

        expect(summary.writeToDisk).toBe(true)
        expect(summary.reportOutputPath).toBe('/tmp/identity-fusion-custom-report/custom-report.json')
        expect(summary.totals.fusionAccountsTotal).toBe(0)
        expect(summary.totals.existingFusionDecisions).toBe(0)
    })
})
