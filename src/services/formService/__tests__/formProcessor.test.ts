import {
    createFusionDecision,
    extractCandidateIdsFromFormInput,
    extractAccountInfoFromFormInput,
} from '../formProcessor'

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

describe('extractAccountInfoFromFormInput', () => {
    it('extracts from a flat structure', () => {
        const input = { account: 'src::nat', name: 'John Doe', source: 'AD' }
        expect(extractAccountInfoFromFormInput(input)).toEqual({
            id: 'src::nat',
            name: 'John Doe',
            sourceName: 'AD',
        })
    })

    it('extracts from an object structure with displayName and sourceName', () => {
        const input = {
            account: {
                value: 'src::nat2',
                displayName: 'Jane Doe',
                sourceName: 'LDAP',
            },
        }
        expect(extractAccountInfoFromFormInput(input)).toEqual({
            id: 'src::nat2',
            name: 'Jane Doe',
            sourceName: 'LDAP',
        })
    })

    it('extracts from an object structure falling back to top-level name and source', () => {
        const input = {
            account: { value: 'src::nat3' },
            name: 'Jim Doe',
            source: 'HR',
        }
        expect(extractAccountInfoFromFormInput(input)).toEqual({
            id: 'src::nat3',
            name: 'Jim Doe',
            sourceName: 'HR',
        })
    })

    it('extracts from a dictionary structure with value', () => {
        const input = {
            a: { id: 'account', value: 'src::nat4' },
            b: { id: 'name', value: 'Jack Doe' },
            c: { id: 'source', value: 'DB' },
        }
        expect(extractAccountInfoFromFormInput(input)).toEqual({
            id: 'src::nat4',
            name: 'Jack Doe',
            sourceName: 'DB',
        })
    })

    it('extracts from a dictionary structure falling back to description', () => {
        const input = {
            a: { id: 'account', value: 'src::nat5' },
            b: { id: 'name', description: 'Jill Doe' },
            c: { id: 'source', description: 'API' },
        }
        expect(extractAccountInfoFromFormInput(input)).toEqual({
            id: 'src::nat5',
            name: 'Jill Doe',
            sourceName: 'API',
        })
    })

    it('handles missing name and source gracefully', () => {
        const input = { account: 'src::nat6' }
        expect(extractAccountInfoFromFormInput(input)).toEqual({
            id: 'src::nat6',
            name: 'src::nat6',
            sourceName: '',
        })
    })

    it('returns null if account ID cannot be found', () => {
        const input = { name: 'No Account', source: 'None' }
        expect(extractAccountInfoFromFormInput(input)).toBeNull()
    })

    it('returns null for empty or null input', () => {
        expect(extractAccountInfoFromFormInput({})).toBeNull()
        expect(extractAccountInfoFromFormInput(null)).toBeNull()
        expect(extractAccountInfoFromFormInput(undefined)).toBeNull()
    })
})
