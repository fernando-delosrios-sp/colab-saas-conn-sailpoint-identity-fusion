import { buildCandidateConditions, buildCandidateFields, buildFormConditions, buildFormFields, buildFormInput, buildFormInputs } from '../formBuilder'
import { SourceType } from '../../../model/config'
import { resolveFormLocale } from '../../emailService/localization'
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
        const identityRule = hideCondition!.rules.find((rule: any) => rule.source === 'identities')
        expect(identityRule!.value).toBe('Alice Doe')
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

    it('buildCandidateConditions returns disable and hide rules per candidate', () => {
        const candidate = {
            id: 'identity-456',
            name: 'Bob Smith',
            attributes: { email: 'bob@example.com' },
            scores: [{ attribute: 'email', algorithm: 'lig3', score: 90 }],
        } as any

        const conditions = buildCandidateConditions(candidate, 0, ['Email'])
        expect(conditions).toHaveLength(2)
        expect(conditions[0].effects[0].effectType).toBe('DISABLE')
        expect(conditions[1].effects[0].effectType).toBe('HIDE')
    })

    it('buildCandidateFields includes attribute and score elements', () => {
        const candidate = {
            id: 'identity-789',
            name: 'Carol Jones',
            attributes: { email: 'carol@example.com' },
            scores: [{ attribute: 'email', algorithm: 'lig3', score: 88, fusionScore: 55 }],
        } as any

        const fields = buildCandidateFields(candidate, 0, ['Email'])
        expect(fields.some((f) => f.id === 'identity-789.email')).toBe(true)
        expect(fields.some((f) => f.id === 'identity-789.email.lig3.score')).toBe(true)
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

describe('buildFormInputs candidates alignment', () => {
    const fusionAccount = {
        managedAccountId: 'src-1::native-1',
        identityDisplayName: 'User One',
        sourceName: 'HR',
        attributes: {},
    } as any

    it('declares candidates input matching buildFormInput for one candidate', () => {
        const candidates = [{ id: 'id-a', name: 'A', attributes: {}, scores: [] }] as any
        const flat = buildFormInput(fusionAccount, candidates)
        const defs = buildFormInputs(fusionAccount, candidates)
        const def = defs.find((i) => i.id === 'candidates')
        expect(def).toBeDefined()
        expect(def!.description).toBe(flat.candidates)
        expect(flat.candidates).toBe('id-a')
    })

    it('declares candidates input matching buildFormInput for multiple candidates', () => {
        const candidates = [
            { id: 'id-a', name: 'A', attributes: {}, scores: [] },
            { id: 'id-b', name: 'B', attributes: {}, scores: [] },
        ] as any
        const flat = buildFormInput(fusionAccount, candidates)
        const defs = buildFormInputs(fusionAccount, candidates)
        const def = defs.find((i) => i.id === 'candidates')
        expect(def!.description).toBe(flat.candidates)
        expect(flat.candidates).toBe('id-a,id-b')
    })

    it('uses empty string for candidates when list is empty', () => {
        const flat = buildFormInput(fusionAccount, [])
        const defs = buildFormInputs(fusionAccount, [])
        const def = defs.find((i) => i.id === 'candidates')
        expect(def!.description).toBe(flat.candidates)
        expect(flat.candidates).toBe('')
    })
})

describe('buildFormFields localization', () => {
    const fusionAccount = {
        sourceName: 'HR Source',
        name: 'Jane Doe',
        managedAccountId: 'acct-1',
        attributes: { email: 'jane@example.com' },
    } as any

    const candidates = [
        {
            id: 'identity-1',
            name: 'Jane Candidate',
            attributes: { email: 'jane@example.com' },
            scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85 }],
        },
    ] as any

    it('localizes form labels to French when locale is fr', () => {
        const fields = buildFormFields(fusionAccount, candidates, ['Email'], SourceType.Authoritative, 'fr')
        const decisions = fields.find((f) => f.key === 'identitiesSection')
        const toggle = (decisions?.config as any)?.formElements?.[0]?.config?.columns?.[0]?.[0]
        expect(toggle?.config?.label).toBe('Nouvelle identité')
    })

    it('localizes form labels to Spanish when locale is es', () => {
        const fields = buildFormFields(fusionAccount, candidates, ['Email'], SourceType.Authoritative, 'es')
        const decisions = fields.find((f) => f.key === 'identitiesSection')
        const toggle = (decisions?.config as any)?.formElements?.[0]?.config?.columns?.[0]?.[0]
        expect(toggle?.config?.label).toBe('Nueva identidad')
    })

    it('localizes Combined score attribute label when locale is fr', () => {
        const fields = buildFormFields(fusionAccount, candidates, ['Email'], SourceType.Authoritative, 'fr')
        const candidateSection = fields.find((f) => f.key === 'identity-1.selectionsection')
        const scoreField = ((candidateSection?.config as any)?.formElements ?? []).find((el: any) =>
            String(el.key).includes('weighted-mean')
        )
        expect(scoreField?.config?.label).toBe('Score combiné')
    })

    it('localizes toggle label when locale is ja', () => {
        const fields = buildFormFields(fusionAccount, candidates, ['Email'], SourceType.Authoritative, 'ja')
        const decisions = fields.find((f) => f.key === 'identitiesSection')
        const toggle = (decisions?.config as any)?.formElements?.[0]?.config?.columns?.[0]?.[0]
        expect(toggle?.config?.label).toBe('新規アイデンティティ')
    })

    it('uses English labels when locale is en', () => {
        const fields = buildFormFields(fusionAccount, candidates, ['Email'], SourceType.Authoritative, 'en')
        const decisions = fields.find((f) => f.key === 'identitiesSection')
        const toggle = (decisions?.config as any)?.formElements?.[0]?.config?.columns?.[0]?.[0]
        expect(toggle?.config?.label).toBe('New identity')
    })

    it('uses English labels when localization is disabled even if defaultLanguage is fr', () => {
        const locale = resolveFormLocale({ enableLocalization: false, defaultLanguage: 'fr' })
        expect(locale).toBe('en')

        const fields = buildFormFields(fusionAccount, candidates, ['Email'], SourceType.Authoritative, locale)
        const decisions = fields.find((f) => f.key === 'identitiesSection')
        const toggle = (decisions?.config as any)?.formElements?.[0]?.config?.columns?.[0]?.[0]
        expect(toggle?.config?.label).toBe('New identity')
    })
})


