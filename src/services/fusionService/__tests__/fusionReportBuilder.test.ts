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

    it('lists only identity candidates for identity-match rows (not transient deferred anchor scoring)', () => {
        const fusionAccount = FusionAccount.fromManagedAccount({
            id: 'acct-1',
            nativeIdentity: 'native-12',
            name: 'A. Ashford',
            sourceId: 'source-a',
            sourceName: 'Source A',
            attributes: { displayName: 'A. Ashford' },
        } as any)

        fusionAccount.addFusionMatch({
            identityId: 'isc-alexia',
            identityName: 'Alexia Ashford',
            candidateType: 'identity',
            scores: [{ attribute: COMBINED_SCORE_ROW_ATTRIBUTE, algorithm: 'weighted', score: 85, isMatch: true } as any],
        } as any)
        fusionAccount.addFusionMatch({
            identityId: undefined,
            identityName: 'A. Ashford anchor',
            candidateType: 'deferred',
            scores: [{ attribute: COMBINED_SCORE_ROW_ATTRIBUTE, algorithm: 'weighted', score: 97, isMatch: true } as any],
        } as any)

        const report = buildFusionReport({
            ...buildReportState({}),
            matchAccounts: [fusionAccount],
            fusionMaxCandidatesForForm: 3,
        })

        expect(report.accounts[0].matches).toHaveLength(1)
        expect(report.accounts[0].matches[0].candidateType).toBe('identity')
        expect(report.accounts[0].matches[0].identityId).toBe('isc-alexia')
    })
})

