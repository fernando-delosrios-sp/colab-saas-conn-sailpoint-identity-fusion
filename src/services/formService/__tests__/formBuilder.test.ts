import { buildFormConditions, buildFormInput, buildFormInputs } from '../formBuilder'
import { buildCandidateList } from '../helpers'

describe('formBuilder conditions', () => {
    it('uses candidate displayName in identities comparison rule', () => {
        const candidates = [
            {
                id: 'identity-123',
                name: 'Alice Doe',
                attributes: { email: 'alice@example.com' },
                scores: [{ attribute: 'email', algorithm: 'lig3', score: 95, fusionScore: 60 }],
            },
        ] as any

        const conditions = buildFormConditions(candidates, ['Email'])

        const hideCondition = conditions.find(
            (condition) =>
                condition.ruleOperator === 'OR' &&
                condition.rules?.some((rule: any) => rule.source === 'identities' && rule.operator === 'NE')
        )

        expect(hideCondition).toBeDefined()
        const identityRule = hideCondition.rules.find((rule: any) => rule.source === 'identities')
        expect(identityRule.value).toBe('Alice Doe')
    })

    it('skips candidate conditions when candidate has no renderable elements', () => {
        const candidates = [
            {
                id: 'identity-empty',
                name: 'Empty Candidate',
                attributes: {},
                scores: [],
            },
        ] as any

        const conditions = buildFormConditions(candidates)
        expect(conditions).toHaveLength(0)
    })
})

describe('candidate list building', () => {
    it('falls back to identity id when displayName is missing', () => {
        const fusionAccount = {
            fusionMatches: [
                {
                    fusionIdentity: {
                        identityId: 'fallback-id-1',
                        attributes: {},
                    },
                    scores: [],
                },
            ],
        } as any

        const candidates = buildCandidateList(fusionAccount, 10)
        expect(candidates[0].name).toBe('fallback-id-1')
    })

    it('orders candidates by combined match score descending and respects cap', () => {
        const mkMatch = (id: string, combined: number) =>
            ({
                fusionIdentity: { identityId: id, attributes: { displayName: id } },
                identityId: id,
                identityName: id,
                scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: combined } as any],
            }) as any

        const fusionAccount = {
            fusionMatches: [mkMatch('low', 80), mkMatch('high', 95), mkMatch('mid', 88)],
        } as any

        const candidates = buildCandidateList(fusionAccount, 2)
        expect(candidates.map((c) => c.id)).toEqual(['high', 'mid'])
    })
})

describe('managed-account key enforcement', () => {
    it('uses managedAccountId as formInput.account', () => {
        const fusionAccount = {
            managedAccountId: 'src-1::native-1',
            identityDisplayName: 'User One',
            sourceName: 'HR',
            attributes: {},
        } as any

        const input = buildFormInput(fusionAccount, [])
        expect(input.account).toBe('src-1::native-1')
    })

    it('throws when managedAccountId is missing', () => {
        const fusionAccount = {
            managedAccountId: undefined,
            name: 'User One',
            sourceName: 'HR',
            attributes: {},
        } as any

        expect(() => buildFormInput(fusionAccount, [])).toThrow('Cannot build review form without managed account key')
        expect(() => buildFormInputs(fusionAccount, [])).toThrow('Cannot build review form without managed account key')
    })
})
