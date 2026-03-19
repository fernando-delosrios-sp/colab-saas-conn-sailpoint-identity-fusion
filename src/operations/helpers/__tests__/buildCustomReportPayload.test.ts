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

        const enriched = enrichISCAccountWithMatching(row, reportIndex)
        const matching = (enriched.account as any).attributes.matching
        expect(enriched.status).toBe('matched')
        expect(matching.analyzedAccounts).toBe(1)
        expect(matching.matches).toHaveLength(1)
    })

    it('marks rows without linked analyzed accounts as not-analyzed', () => {
        const reportIndex = buildReportAccountIndex([])
        const row = {
            key: 'fusion-2',
            disabled: false,
            attributes: {
                accounts: ['acc-404'],
            },
        } as any

        const enriched = enrichISCAccountWithMatching(row, reportIndex)
        const matching = (enriched.account as any).attributes.matching
        expect(enriched.status).toBe('not-analyzed')
        expect(matching.matches).toEqual([])
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
