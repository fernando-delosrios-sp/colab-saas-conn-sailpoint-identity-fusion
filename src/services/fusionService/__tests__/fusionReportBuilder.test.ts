import { FusionAccount } from '../../../model/account'
import { COMBINED_SCORE_ROW_ATTRIBUTE } from '../../matchingService/matchingService'
import { createUrlContext } from '../../../utils/url'
import { buildFusionReport, FusionReportState } from '../fusionReportBuilder'

beforeEach(() => {
    FusionAccount.configure({ sources: [] } as any)
})

function buildReportState(
    overrides: Partial<Pick<FusionReportState, 'fusionEnableAutoMerge' | 'fusionAutoMergeScore'>>
): FusionReportState {
    const fusionAccount = FusionAccount.fromManagedAccount({
        id: 'acct-1',
        nativeIdentity: 'native-1',
        name: 'Test Account',
        sourceId: 'source-a',
        sourceName: 'Source A',
        attributes: {},
    } as any)

    fusionAccount.addFusionMatch({
        identityId: 'identity-1',
        identityName: 'Test Identity',
        candidateType: 'identity',
        scores: [
            {
                attribute: COMBINED_SCORE_ROW_ATTRIBUTE,
                algorithm: 'weighted',
                score: 95,
                isMatch: true,
            } as any,
        ],
    } as any)

    return {
        conflictingFusionIdentityAccounts: new Map(),
        matchAccounts: [fusionAccount],
        failedMatchingAccounts: [],
        deferredMatchReportData: [],
        analyzedNonMatchReportData: [],
        newManagedAccountsCount: 1,
        urlContext: createUrlContext('https://example.identitynow.com'),
        sourcesByName: new Map([
            ['Source A', { id: 'source-a', name: 'Source A', sourceType: 'authoritative' } as any],
        ]),
        reportAttributes: [],
        fusionIdentityComparisonsByAccount: new WeakMap(),
        sources: {} as any,
        fusionEnableAutoMerge: false,
        ...overrides,
    }
}

describe('buildFusionReport', () => {
    it('does not mark matches as auto when automatic merge is disabled', () => {
        const report = buildFusionReport(
            buildReportState({
                fusionEnableAutoMerge: false,
                fusionAutoMergeScore: 90,
            })
        )

        expect(report.accounts[0].matches[0].auto).toBe(false)
        expect(report.accounts[0].matches[0].manual).toBe(true)
    })

    it('marks matches as auto when automatic merge is enabled and score meets threshold', () => {
        const report = buildFusionReport(
            buildReportState({
                fusionEnableAutoMerge: true,
                fusionAutoMergeScore: 90,
            })
        )

        expect(report.accounts[0].matches[0].auto).toBe(true)
        expect(report.accounts[0].matches[0].manual).toBe(false)
    })

    it('marks matches as manual when automatic merge is enabled but score is below threshold', () => {
        const report = buildFusionReport(
            buildReportState({
                fusionEnableAutoMerge: true,
                fusionAutoMergeScore: 96,
            })
        )

        expect(report.accounts[0].matches[0].auto).toBe(false)
        expect(report.accounts[0].matches[0].manual).toBe(true)
    })
})
