import { createMatchCandidateRecord } from '../matchCandidateRecord'

describe('createMatchCandidateRecord', () => {
    it('creates a record with identity id, identity name, and attributes', () => {
        const record = createMatchCandidateRecord('identity-1', 'Jane Doe', { email: 'jane@example.com' })

        expect(record).toEqual({
            identityId: 'identity-1',
            identityName: 'Jane Doe',
            attributes: { email: 'jane@example.com' },
        })
    })

    it('does not reflect later mutations of the source attributes object', () => {
        const attributes = { email: 'jane@example.com' }

        const record = createMatchCandidateRecord('identity-1', 'Jane Doe', attributes)
        attributes.email = 'changed@example.com'

        expect(record.attributes.email).toBe('jane@example.com')
    })
})
