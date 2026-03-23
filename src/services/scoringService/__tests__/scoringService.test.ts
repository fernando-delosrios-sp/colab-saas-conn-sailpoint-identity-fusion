import { ScoringService } from '../scoringService'

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

    it('invalidates average match when a mandatory threshold fails', () => {
        const service = new ScoringService(
            {
                matchingConfigs: baseMatchingConfigs,
                fusionUseAverageScore: true,
                fusionAverageScore: 50,
            } as any,
            { crash: jest.fn() } as any
        )
        const { fusionAccount, fusionIdentity } = createAccounts()

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
    })

    it('invalidates match in report mode when a mandatory threshold fails', () => {
        const service = new ScoringService(
            {
                matchingConfigs: baseMatchingConfigs,
                fusionUseAverageScore: false,
            } as any,
            { crash: jest.fn() } as any
        )
        const { fusionAccount, fusionIdentity } = createAccounts()
        service.enableReportMode()

        service.scoreFusionAccount(fusionAccount, [fusionIdentity])

        expect(fusionAccount.addFusionMatch).not.toHaveBeenCalled()
    })

    it('still matches when mandatory threshold is met', () => {
        const service = new ScoringService(
            {
                matchingConfigs: baseMatchingConfigs,
                fusionUseAverageScore: true,
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
    })
})

describe('ScoringService skipMatchIfMissing behavior', () => {
    const log = { crash: jest.fn() } as any

    it('skips non-mandatory rule when value is missing and toggle is enabled', () => {
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
                fusionUseAverageScore: false,
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
    })

    it('evaluates missing values when toggle is disabled (counts as result)', () => {
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
                fusionUseAverageScore: false,
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

    it('uses only evaluated rules in average mode when missing values are skipped', () => {
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
                fusionUseAverageScore: true,
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
        expect(fusionMatch.scores).toHaveLength(2) // name + average
    })

    it('includes missing-value rules in average mode when toggle is disabled', () => {
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
                fusionUseAverageScore: true,
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
