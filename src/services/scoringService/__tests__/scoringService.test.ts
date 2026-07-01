import { COMBINED_SCORE_ROW_ATTRIBUTE, ScoringService, WEIGHTED_MEAN_ALGORITHM } from '../scoringService'
import { effectiveSkipMatchIfMissing, effectiveSkipMatchIfThresholdNotMet } from '../../../model/config'
import { FusionAccount } from '../../../model/account'
import { MatchCandidateType } from '../types'
import * as scoringHelpers from '../helpers'

describe('ScoringService mandatory matching behavior', () => {
    const baseMatchingConfigs = [
        {
            attribute: 'mandatoryAttr',
            algorithm: 'dice' as const,
            fusionScore: 90,
            mandatory: true,
        },
        {
            attribute: 'optionalAttr',
            algorithm: 'dice' as const,
            fusionScore: 90,
            mandatory: false,
        },
    ]

    const createAccounts = () => {
        const fusionAccount = {
            attributes: {
                mandatoryAttr: 'alpha',
                optionalAttr: 'same-value',
            },
            addFusionMatch: jest.fn(),
        } as any

        const fusionIdentity = {
            attributes: {
                mandatoryAttr: 'beta',
                optionalAttr: 'same-value',
            },
            identityId: 'identity-1',
            displayName: 'Identity One',
        } as any

        return { fusionAccount, fusionIdentity }
    }

    it('invalidates combined match when a mandatory threshold fails', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: baseMatchingConfigs,
                fusionManualReviewScore: 50,
            } as any,
            { crash: jest.fn() } as any
        )
        const { fusionAccount, fusionIdentity } = createAccounts()

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
    })

    it('matches when mandatory threshold is met and combined score passes', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: baseMatchingConfigs,
                fusionManualReviewScore: 90,
            } as any,
            { crash: jest.fn() } as any
        )
        const fusionAccount = {
            attributes: {
                mandatoryAttr: 'same-value',
                optionalAttr: 'same-value',
            },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: {
                mandatoryAttr: 'same-value',
                optionalAttr: 'same-value',
            },
            identityId: 'identity-1',
            displayName: 'Identity One',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const combined = fusionMatch.scores.find((s: any) => s.algorithm === WEIGHTED_MEAN_ALGORITHM)
        expect(combined).toBeDefined()
        expect(combined.attribute).toBe(COMBINED_SCORE_ROW_ATTRIBUTE)
        expect(combined.isMatch).toBe(true)
    })

    it('evaluates mandatory rules when values are missing (does not skip), failing the candidate', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'birthdate',
                        algorithm: 'lig3',
                        fusionScore: 100,
                        mandatory: true,
                        skipMatchIfMissing: true,
                    },
                    {
                        attribute: 'last4ssn',
                        algorithm: 'lig3',
                        fusionScore: 100,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            { crash: jest.fn() } as any
        )

        const fusionAccount = {
            attributes: { birthdate: '', last4ssn: '1234' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { birthdate: '', last4ssn: '1234' },
            identityId: 'identity-m',
            displayName: 'Identity M',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
    })

    it('assigns weightedScore partials that sum to the combined score', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    { attribute: 'firstname', algorithm: 'jaro-winkler', fusionScore: 60 },
                    { attribute: 'lastname', algorithm: 'jaro-winkler', fusionScore: 60 },
                ],
                fusionManualReviewScore: 70,
            } as any,
            { crash: jest.fn() } as any
        )
        const fusionAccount = {
            attributes: { firstname: 'John', lastname: 'Smith' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { firstname: 'Jon', lastname: 'Smith' },
            identityId: 'identity-1',
            identityDisplayName: 'J S',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalled()
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const rules = fusionMatch.scores.filter((s: any) => !s.skipped && s.algorithm !== WEIGHTED_MEAN_ALGORITHM)
        const combined = fusionMatch.scores.find((s: any) => s.algorithm === WEIGHTED_MEAN_ALGORITHM)
        expect(combined).toBeDefined()
        const sumWeighted = rules.reduce((acc: number, s: any) => acc + (s.weightedScore ?? 0), 0)
        expect(Math.round(sumWeighted * 100) / 100).toBe(combined.score)
    })
})

describe('ScoringService max identity match candidates', () => {
    beforeAll(() => {
        FusionAccount.configure({ sources: [] } as any)
    })

    it('stops comparing further identities once max threshold-passing identity matches are recorded', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler' as const,
                        fusionScore: 80,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            { crash: jest.fn() } as any
        )

        const fusionAccount = FusionAccount.fromManagedAccount({
            id: 'acct-1',
            nativeIdentity: 'native-1',
            name: 'Managed One',
            sourceId: 'src-1',
            sourceName: 'Source A',
            attributes: { email: 'same@example.com' },
        } as any)

        const mkIdentity = (id: string) =>
            FusionAccount.fromIdentity({
                id,
                name: id,
                attributes: { email: 'same@example.com' },
            } as any)

        const compared = await service.scoreFusionAccount(
            fusionAccount,
            [mkIdentity('id-a'), mkIdentity('id-b'), mkIdentity('id-c'), mkIdentity('id-d')],
            MatchCandidateType.Identity,
            2
        )

        expect(fusionAccount.fusionMatches.filter((m) => (m.candidateType ?? 'identity') === 'identity')).toHaveLength(
            2
        )
        expect(compared).toBe(2)
    })
})

describe('ScoringService skipMatchIfMissing behavior', () => {
    const log = { crash: jest.fn() } as any

    it('pushes skipped row and does not match when only rule is skipped', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 90,
                        skipMatchIfMissing: true,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { email: '   ' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { email: 'person@example.com' },
            identityId: 'identity-1',
            displayName: 'Identity One',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
        expect(log.crash).not.toHaveBeenCalled()
    })

    it('evaluates missing values when toggle is disabled (counts toward combined)', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 0,
                        skipMatchIfMissing: false,
                    },
                ],
                fusionManualReviewScore: 0,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { email: undefined },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { email: '' },
            identityId: 'identity-2',
            displayName: 'Identity Two',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
    })

    it('uses only non-skipped rules in weighted combined when missing values are skipped', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'name',
                        algorithm: 'jaro-winkler',
                        fusionScore: 80,
                        skipMatchIfMissing: true,
                    },
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 80,
                        skipMatchIfMissing: true,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { name: 'John Smith', email: '' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { name: 'John Smith', email: undefined },
            identityId: 'identity-3',
            displayName: 'Identity Three',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        expect(fusionMatch.scores).toHaveLength(3)
        expect(fusionMatch.scores.filter((s: any) => s.skipped)).toHaveLength(1)
        expect(fusionMatch.scores.find((s: any) => s.algorithm === WEIGHTED_MEAN_ALGORITHM)).toBeDefined()
    })

    it('includes missing-value rules in blend when skip is disabled on both', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'name',
                        algorithm: 'jaro-winkler',
                        fusionScore: 80,
                        skipMatchIfMissing: false,
                    },
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 80,
                        skipMatchIfMissing: false,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { name: 'John Smith', email: '' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { name: 'John Smith', email: 'person@example.com' },
            identityId: 'identity-4',
            displayName: 'Identity Four',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
    })

    it('skips custom Velocity rule with empty output by default and matches on remaining rule', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'name',
                        algorithm: 'custom',
                        customVelocityExpression: '#if(false)1#end',
                        fusionScore: 80,
                    },
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 80,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { name: 'John Smith', email: 'person@example.com' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { name: 'John Smith', email: 'person@example.com' },
            identityId: 'identity-5',
            displayName: 'Identity Five',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const customRule = fusionMatch.scores.find((s: any) => s.algorithm === 'custom')
        expect(customRule?.skipped).toBe(true)
    })

    it('does not skip custom Velocity empty output when skip is disabled and can fail combined score', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'name',
                        algorithm: 'custom',
                        customVelocityExpression: '#if(false)1#end',
                        fusionScore: 80,
                        skipMatchIfMissing: false,
                    },
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 80,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { name: 'John Smith', email: 'person@example.com' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { name: 'John Smith', email: 'person@example.com' },
            identityId: 'identity-6',
            displayName: 'Identity Six',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
    })
})

describe('ScoringService combined-score early exit', () => {
    const log = { crash: jest.fn() } as any

    it('does not evaluate later rules when perfect future scores cannot reach fusionManualReviewScore', async () => {
        const scoreDiceSpy = jest.spyOn(scoringHelpers, 'scoreDice')

        const service = new ScoringService(
            {
                matchingConfigs: [
                    { attribute: 'a', algorithm: 'dice', fusionScore: 10, mandatory: false },
                    { attribute: 'b', algorithm: 'dice', fusionScore: 10, mandatory: false },
                ],
                fusionManualReviewScore: 90,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { a: 'x', b: 'y' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { a: 'z', b: 'y' },
            identityId: 'id-1',
            displayName: 'One',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
        expect(scoreDiceSpy).toHaveBeenCalledTimes(1)

        scoreDiceSpy.mockRestore()
    })
})

describe('ScoringService deferred candidate matching', () => {
    it('does not compare a managed account against itself for deferred candidates', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 90,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            { crash: jest.fn() } as any
        )

        const managedCandidate = {
            attributes: { email: 'self@example.com' },
            managedAccountId: 'source-id::self@example.com',
            managedKeyOrUndefined: 'source-id::self@example.com',
            addFusionMatch: jest.fn(),
        } as any

        const compared = await service.scoreFusionAccount(
            managedCandidate,
            [managedCandidate],
            MatchCandidateType.NewUnmatched
        )

        expect(compared).toBe(0)
        expect(managedCandidate.addFusionMatch).not.toHaveBeenCalled()
    })

    it('does not compare against persisted unmatched candidate representing the same managed account', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 90,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            { crash: jest.fn() } as any
        )

        const managedKey = 'source-id::self@example.com'
        const analyzedManagedCandidate = {
            attributes: { email: 'self@example.com' },
            managedAccountId: managedKey,
            managedKeyOrUndefined: managedKey,
            addFusionMatch: jest.fn(),
        } as any

        // Simulates a previously persisted unmatched fusion account shape where
        // managedAccountId may not be present but the same managed key is retained.
        const persistedUnmatchedCandidate = {
            attributes: { email: 'self@example.com' },
            managedAccountId: undefined,
            managedKeyOrUndefined: 'fusion-simple-key',
            originAccountId: managedKey,
            accountIdsSet: new Set<string>(),
            missingAccountIdsSet: new Set<string>([managedKey]),
        } as any

        const compared = await service.scoreFusionAccount(
            analyzedManagedCandidate,
            [persistedUnmatchedCandidate],
            MatchCandidateType.NewUnmatched
        )

        expect(compared).toBe(0)
        expect(analyzedManagedCandidate.addFusionMatch).not.toHaveBeenCalled()
    })

    it('does not compare when persisted origin account differs only by composite-key whitespace', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 90,
                    },
                ],
                fusionManualReviewScore: 80,
            } as any,
            { crash: jest.fn() } as any
        )

        const managedKey = 'source-id::self@example.com'
        const analyzedManagedCandidate = {
            attributes: { email: 'self@example.com' },
            managedAccountId: managedKey,
            managedKeyOrUndefined: managedKey,
            addFusionMatch: jest.fn(),
        } as any

        const persistedUnmatchedCandidate = {
            attributes: { email: 'self@example.com' },
            managedAccountId: undefined,
            managedKeyOrUndefined: 'fusion-simple-key',
            originAccountId: ' source-id :: self@example.com ',
            accountIdsSet: new Set<string>(),
            missingAccountIdsSet: new Set<string>(),
        } as any

        const compared = await service.scoreFusionAccount(
            analyzedManagedCandidate,
            [persistedUnmatchedCandidate],
            MatchCandidateType.NewUnmatched
        )

        expect(compared).toBe(0)
        expect(analyzedManagedCandidate.addFusionMatch).not.toHaveBeenCalled()
    })
})

describe('effectiveSkipMatchIfMissing', () => {
    it('skips when omitted or true, unless mandatory', () => {
        expect(effectiveSkipMatchIfMissing({})).toBe(true)
        expect(effectiveSkipMatchIfMissing({ skipMatchIfMissing: true })).toBe(true)
        expect(effectiveSkipMatchIfMissing({ mandatory: true })).toBe(false)
        expect(effectiveSkipMatchIfMissing({ mandatory: true, skipMatchIfMissing: true })).toBe(false)
    })

    it('does not skip when explicitly false', () => {
        expect(effectiveSkipMatchIfMissing({ skipMatchIfMissing: false })).toBe(false)
        expect(effectiveSkipMatchIfMissing({ mandatory: false, skipMatchIfMissing: false })).toBe(false)
    })
})

describe('effectiveSkipMatchIfThresholdNotMet', () => {
    it('does not skip by default (toggle omitted or false)', () => {
        expect(effectiveSkipMatchIfThresholdNotMet({})).toBe(false)
        expect(effectiveSkipMatchIfThresholdNotMet({ skipMatchIfThresholdNotMet: false })).toBe(false)
    })

    it('skips when toggle is true and rule is not mandatory', () => {
        expect(effectiveSkipMatchIfThresholdNotMet({ skipMatchIfThresholdNotMet: true })).toBe(true)
        expect(
            effectiveSkipMatchIfThresholdNotMet({ mandatory: false, skipMatchIfThresholdNotMet: true })
        ).toBe(true)
    })

    it('never skips mandatory rules regardless of toggle', () => {
        expect(effectiveSkipMatchIfThresholdNotMet({ mandatory: true })).toBe(false)
        expect(
            effectiveSkipMatchIfThresholdNotMet({ mandatory: true, skipMatchIfThresholdNotMet: true })
        ).toBe(false)
    })
})

describe('ScoringService.blendWeight', () => {
    it('uses 1 when fusionScore is 0 or lower', () => {
        expect(ScoringService.blendWeight(0)).toBe(1)
        expect(ScoringService.blendWeight(-5)).toBe(1)
    })

    it('uses fusionScore when positive', () => {
        expect(ScoringService.blendWeight(80)).toBe(80)
    })
})

describe('ScoringService skipMatchIfThresholdNotMet behavior', () => {
    const log = { crash: jest.fn() } as any

    it('skips non-mandatory below-threshold rule when toggle is enabled', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 90,
                        skipMatchIfThresholdNotMet: true,
                    },
                    {
                        attribute: 'department',
                        algorithm: 'jaro-winkler',
                        fusionScore: 80,
                        skipMatchIfThresholdNotMet: true,
                    },
                ],
                fusionManualReviewScore: 50,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { email: 'same@example.com', department: 'engineering' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { email: 'same@example.com', department: 'finance and accounting' },
            identityId: 'identity-1',
            displayName: 'Identity One',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const deptRule = fusionMatch.scores.find((s: any) => s.attribute === 'department')
        const emailRule = fusionMatch.scores.find((s: any) => s.attribute === 'email')
        expect(deptRule.skipped).toBe(true)
        expect(deptRule.comment).toBe('Rule skipped (score below threshold)')
        expect(emailRule.skipped).toBeUndefined()
        expect(emailRule.isMatch).toBe(true)
    })

    it('still contributes non-mandatory below-threshold rule when toggle is disabled', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'name',
                        algorithm: 'jaro-winkler',
                        fusionScore: 95,
                        skipMatchIfThresholdNotMet: false,
                    },
                ],
                fusionManualReviewScore: 50,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { name: 'John Smith' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { name: 'Jonathan Smyth' },
            identityId: 'identity-1',
            displayName: 'Identity One',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const rule = fusionMatch.scores.find((s: any) => s.attribute === 'name')
        expect(rule.skipped).toBeUndefined()
        expect(rule.isMatch).toBe(false)
    })

    it('fails candidate when mandatory below-threshold rule is below threshold even with toggle enabled', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'email',
                        algorithm: 'jaro-winkler',
                        fusionScore: 99,
                        mandatory: true,
                        skipMatchIfThresholdNotMet: true,
                    },
                ],
                fusionManualReviewScore: 0,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { email: 'a@example.com' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { email: 'b@example.com' },
            identityId: 'identity-1',
            displayName: 'Identity One',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
    })

    it('recalculates combined score excluding threshold-skipped rules', async () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'firstname',
                        algorithm: 'jaro-winkler',
                        fusionScore: 80,
                        skipMatchIfThresholdNotMet: false,
                    },
                    {
                        attribute: 'lastname',
                        algorithm: 'jaro-winkler',
                        fusionScore: 95,
                        skipMatchIfThresholdNotMet: true,
                    },
                ],
                fusionManualReviewScore: 50,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { firstname: 'John', lastname: 'Smith' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { firstname: 'John', lastname: 'Montgomery Fitzgerald' },
            identityId: 'identity-1',
            displayName: 'Identity One',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const lastNameRule = fusionMatch.scores.find((s: any) => s.attribute === 'lastname')
        const firstNameRule = fusionMatch.scores.find((s: any) => s.attribute === 'firstname')
        expect(lastNameRule.skipped).toBe(true)
        expect(lastNameRule.comment).toBe('Rule skipped (score below threshold)')
        expect(firstNameRule.skipped).toBeUndefined()
        const combined = fusionMatch.scores.find((s: any) => s.algorithm === WEIGHTED_MEAN_ALGORITHM)
        // firstname "John" vs "John" → 100; combined must equal 100, not a weighted blend with lastname.
        expect(combined.score).toBe(100)
    })

    it('exact-match check ignores threshold-skipped rules', async () => {
        // exactMatch.ts requires non-skipped rules to all be exact (score 100). With one rule
        // skipped by threshold, the remaining rule being exact should still produce a non-skip
        // report whose score array yields isExactAttributeMatchScores true.
        const service = new ScoringService(
            {
                matchingConfigs: [
                    {
                        attribute: 'firstname',
                        algorithm: 'jaro-winkler',
                        fusionScore: 100,
                        mandatory: true,
                    },
                    {
                        attribute: 'lastname',
                        algorithm: 'jaro-winkler',
                        fusionScore: 99,
                        skipMatchIfThresholdNotMet: true,
                    },
                ],
                fusionManualReviewScore: 50,
            } as any,
            log
        )

        const fusionAccount = {
            attributes: { firstname: 'John', lastname: 'Smith' },
            addFusionMatch: jest.fn(),
        } as any
        const fusionIdentity = {
            attributes: { firstname: 'John', lastname: 'Smyth' },
            identityId: 'identity-1',
            displayName: 'Identity One',
        } as any

        await service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const firstNameRule = fusionMatch.scores.find((s: any) => s.attribute === 'firstname')
        const lastNameRule = fusionMatch.scores.find((s: any) => s.attribute === 'lastname')
        expect(firstNameRule.skipped).toBeUndefined()
        expect(firstNameRule.isMatch).toBe(true)
        expect(lastNameRule.skipped).toBe(true)
    })
})

describe('ScoringService binary algorithm dispatch', () => {
    it('dispatches binary algorithm through scoreAttribute and returns a ScoreReport', () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    { attribute: 'employeeId', algorithm: 'binary', fusionScore: 100, mandatory: true },
                ],
                fusionManualReviewScore: 50,
            } as any,
            { crash: jest.fn() } as any
        )

        const scoreBinarySpy = jest.spyOn(scoringHelpers, 'scoreBinary').mockReturnValue({
            attribute: 'employeeId',
            algorithm: 'binary',
            fusionScore: 100,
            mandatory: true,
            skipMatchIfMissing: true,
            skipMatchIfThresholdNotMet: false,
            score: 100,
            isMatch: true,
        })

        const result = (service as any).scoreAttribute('ABC-001', 'ABC-001', {
            attribute: 'employeeId',
            algorithm: 'binary',
            fusionScore: 100,
            mandatory: true,
        } as any)

        expect(scoreBinarySpy).toHaveBeenCalledWith('ABC-001', 'ABC-001', expect.objectContaining({ algorithm: 'binary' }))
        expect(result.algorithm).toBe('binary')
        expect(result.score).toBe(100)
        expect(result.isMatch).toBe(true)

        scoreBinarySpy.mockRestore()
    })
})
