import { buildFormConditions, buildFormFields, buildFormInput, buildFormInputs } from '../formBuilder'
import { SourceType } from '../../../model/config'
import { resolveFormLocale } from '../../emailService/localization'
import { buildCandidateList, buildFormName } from '../helpers'
import { FORM_HTML_ACCOUNT_INPUT, FORM_HTML_CANDIDATES_INPUT } from '../formHtml'

const collectElements = (elements: any[], acc: any[] = []): any[] => {
    for (const el of elements ?? []) {
        acc.push(el)
        const nested = el.config?.formElements
        if (Array.isArray(nested)) collectElements(nested, acc)
        const columns = el.config?.columns
        if (Array.isArray(columns)) {
            for (const col of columns) {
                if (Array.isArray(col)) collectElements(col, acc)
            }
        }
    }
    return acc
}

describe('formBuilder HTML restyle', () => {
    const fusionAccount = {
        managedAccountId: 'src-1::native-1',
        identityDisplayName: 'User One',
        name: 'User One',
        sourceName: 'HR',
        iscAccountId: 'isc-acct-1',
        attributes: { email: 'user@example.com' },
    } as any

    const candidates = [
        {
            id: 'identity-1',
            name: 'Alice Doe',
            attributes: { email: 'alice@example.com' },
            scores: [{ attribute: 'email', algorithm: 'lig3', score: 95, fusionScore: 60, isMatch: true }],
        },
        {
            id: 'identity-2',
            name: 'Bob Smith',
            attributes: { email: 'bob@example.com' },
            scores: [{ attribute: 'email', algorithm: 'lig3', score: 80, fusionScore: 60, isMatch: false }],
        },
    ] as any

    it('New review form uses HTML for the whole display surface', () => {
        const fields = buildFormFields(fusionAccount, candidates, ['Email'], SourceType.Authoritative, 'en')
        const all = collectElements(fields)
        expect(all.filter((el) => el.elementType === 'TEXT')).toHaveLength(0)
        expect(all.some((el) => el.id === 'newIdentity' && el.elementType === 'TOGGLE')).toBe(true)
        expect(all.some((el) => el.id === 'identities' && el.elementType === 'SELECT')).toBe(true)
        expect(
            all.some((el) => el.id === 'accountDisplay' && el.config?.description === '{{$.form.input.accountHtml}}')
        ).toBe(true)
        expect(
            all.some(
                (el) => el.id === 'candidatesDisplay' && el.config?.description === '{{$.form.input.candidatesHtml}}'
            )
        ).toBe(true)
        const descriptions = all.filter((el) => el.elementType === 'DESCRIPTION')
        expect(descriptions).toHaveLength(2)
        for (const el of descriptions) {
            expect(String(el.config?.label ?? '').trim().length).toBeGreaterThan(0)
        }

        const input = buildFormInput(fusionAccount, candidates, ['Email'])
        expect(input[FORM_HTML_ACCOUNT_INPUT]).toContain('User One')
        expect(input[FORM_HTML_CANDIDATES_INPUT]).toContain('Alice Doe')
        expect(input.account).toBe('src-1::native-1')
        expect(input.candidates).toBe('identity-1,identity-2')
    })

    it('Multiple candidates stay visible together', () => {
        const fields = buildFormFields(fusionAccount, candidates, ['Email'])
        const all = collectElements(fields)
        expect(all.some((el) => el.elementType === 'SECTION' && String(el.id).includes('selectionsection'))).toBe(false)

        const conditions = buildFormConditions(candidates, ['Email'])
        expect(conditions).toHaveLength(0)
        expect(conditions.some((c) => c.effects?.some((e) => e.effectType === 'HIDE'))).toBe(false)

        const html = buildFormInput(fusionAccount, candidates, ['Email'])[FORM_HTML_CANDIDATES_INPUT]
        expect(html).toContain('Alice Doe')
        expect(html).toContain('Bob Smith')
    })

    it('Per-account definition naming unchanged', () => {
        const name = buildFormName(fusionAccount, 'Fusion Review')
        expect(name).toContain('Fusion Review')
        expect(name).toContain('User One')
        expect(name).toContain('[HR]')
        expect(name).toContain('src-1::native-1')

        const fields = buildFormFields(fusionAccount, candidates, ['Email'])
        const all = collectElements(fields)
        const select = all.find((el) => el.id === 'identities')
        expect(select?.config?.dataSource?.dataSourceType).toBe('SEARCH_V2')
        expect(select?.config?.dataSource?.config?.query).toBe('id:identity-1 OR id:identity-2')
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
        const html = buildFormInput(fusionAccount, candidates, ['Email'], SourceType.Authoritative, 'fr')[
            FORM_HTML_CANDIDATES_INPUT
        ]
        expect(html).toContain('Score combiné')
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
