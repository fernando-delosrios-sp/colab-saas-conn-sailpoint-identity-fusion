import { createFusionDecision, extractCandidateIdsFromFormInput } from '../formProcessor'

describe('formProcessor createFusionDecision', () => {
    it('treats SUBMITTED state as finished', async () => {
        const decision = await createFusionDecision({
            id: 'fi-1',
            state: 'SUBMITTED',
            recipients: [{ id: 'reviewer-1', type: 'IDENTITY' }],
            formInput: {
                account: 'src-1::account-1',
                name: 'Account One',
                source: 'HR',
                sourceType: 'authoritative',
            },
            formData: {
                newIdentity: false,
                identities: ['identity-123'],
                comments: 'Finalized in submitted state',
            },
        } as any)

        expect(decision).toBeDefined()
        expect(decision?.finished).toBe(true)
        expect(decision?.newIdentity).toBe(false)
        expect(decision?.identityId).toBe('identity-123')
    })

    it('rejects non-composite managed account IDs', async () => {
        const decision = await createFusionDecision({
            id: 'fi-raw-id',
            state: 'COMPLETED',
            recipients: [{ id: 'reviewer-1', type: 'IDENTITY' }],
            formInput: {
                account: 'account-1',
                name: 'Account One',
                source: 'HR',
                sourceType: 'authoritative',
            },
            formData: {
                newIdentity: false,
                identities: ['identity-123'],
            },
        } as any)

        expect(decision).toBeNull()
    })
})

describe('extractCandidateIdsFromFormInput', () => {
    it('reads comma-separated ids from flat formInput', () => {
        expect(
            extractCandidateIdsFromFormInput({
                account: 'src::nat',
                candidates: 'uuid-1,uuid-2',
            })
        ).toEqual(['uuid-1', 'uuid-2'])
    })

    it('trims whitespace around ids', () => {
        expect(extractCandidateIdsFromFormInput({ candidates: ' uuid-1 , uuid-2 ' })).toEqual(['uuid-1', 'uuid-2'])
    })

    it('reads from dictionary-shaped formInput (definition input objects)', () => {
        const formInput = {
            a: { id: 'account', value: 'src::nat' },
            b: { id: 'candidates', value: 'id-x,id-y' },
        }
        expect(extractCandidateIdsFromFormInput(formInput)).toEqual(['id-x', 'id-y'])
    })

    it('falls back to description when value is empty', () => {
        const formInput = {
            c: { id: 'candidates', description: 'only-desc' },
        }
        expect(extractCandidateIdsFromFormInput(formInput)).toEqual(['only-desc'])
    })

    it('returns empty array when candidates missing or empty', () => {
        expect(extractCandidateIdsFromFormInput({ account: 'x' })).toEqual([])
        expect(extractCandidateIdsFromFormInput({ candidates: '' })).toEqual([])
        expect(extractCandidateIdsFromFormInput(null)).toEqual([])
    })
})
