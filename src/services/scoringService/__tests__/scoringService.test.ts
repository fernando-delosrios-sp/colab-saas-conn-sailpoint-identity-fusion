import { COMBINED_SCORE_ROW_ATTRIBUTE, ScoringService, WEIGHTED_MEAN_ALGORITHM } from '../scoringService'

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

    it('invalidates combined match when a mandatory threshold fails', () => {
        const service = new ScoringService(
            {
                matchingConfigs: baseMatchingConfigs,
                fusionAverageScore: 50,
            } as any,
            { crash: jest.fn() } as any
        )
        const { fusionAccount, fusionIdentity } = createAccounts()

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
    })

    it('matches when mandatory threshold is met and combined score passes', () => {
        const service = new ScoringService(
            {
                matchingConfigs: baseMatchingConfigs,
                fusionAverageScore: 90,
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

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const combined = fusionMatch.scores.find((s: any) => s.algorithm === WEIGHTED_MEAN_ALGORITHM)
        expect(combined).toBeDefined()
        expect(combined.attribute).toBe(COMBINED_SCORE_ROW_ATTRIBUTE)
        expect(combined.isMatch).toBe(true)
    })

    it('assigns weightedScore partials that sum to the combined score', () => {
        const service = new ScoringService(
            {
                matchingConfigs: [
                    { attribute: 'firstname', algorithm: 'jaro-winkler', fusionScore: 60 },
                    { attribute: 'lastname', algorithm: 'jaro-winkler', fusionScore: 60 },
                ],
                fusionAverageScore: 70,
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

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalled()
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        const rules = fusionMatch.scores.filter(
            (s: any) => !s.skipped && s.algorithm !== WEIGHTED_MEAN_ALGORITHM
        )
        const combined = fusionMatch.scores.find((s: any) => s.algorithm === WEIGHTED_MEAN_ALGORITHM)
        expect(combined).toBeDefined()
        const sumWeighted = rules.reduce((acc: number, s: any) => acc + (s.weightedScore ?? 0), 0)
        expect(Math.round(sumWeighted * 100) / 100).toBe(combined.score)
    })
})

describe('ScoringService skipMatchIfMissing behavior', () => {
    const log = { crash: jest.fn() } as any

    it('pushes skipped row and does not match when only rule is skipped', () => {
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
                fusionAverageScore: 80,
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

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
        expect(log.crash).not.toHaveBeenCalled()
    })

    it('evaluates missing values when toggle is disabled (counts toward combined)', () => {
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
                fusionAverageScore: 0,
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

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
    })

    it('uses only non-skipped rules in weighted combined when missing values are skipped', () => {
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
                fusionAverageScore: 80,
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

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).toHaveBeenCalledTimes(1)
        const fusionMatch = fusionAccount.addFusionMatch.mock.calls[0][0]
        expect(fusionMatch.scores).toHaveLength(3)
        expect(fusionMatch.scores.filter((s: any) => s.skipped)).toHaveLength(1)
        expect(fusionMatch.scores.find((s: any) => s.algorithm === WEIGHTED_MEAN_ALGORITHM)).toBeDefined()
    })

    it('includes missing-value rules in blend when skip is disabled on both', () => {
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
                fusionAverageScore: 80,
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

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
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
