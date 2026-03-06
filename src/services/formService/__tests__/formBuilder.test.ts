import { buildFormConditions } from '../formBuilder'
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

        const candidates = buildCandidateList(fusionAccount)
        expect(candidates[0].name).toBe('fallback-id-1')
    })
})
