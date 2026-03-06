import { createFusionDecision } from '../formProcessor'

describe('formProcessor createFusionDecision', () => {
    it('treats SUBMITTED state as finished', () => {
        const decision = createFusionDecision({
            id: 'fi-1',
            state: 'SUBMITTED',
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
                comments: 'Finalized in submitted state',
            },
        } as any)

        expect(decision).toBeDefined()
        expect(decision?.finished).toBe(true)
        expect(decision?.newIdentity).toBe(false)
        expect(decision?.identityId).toBe('identity-123')
    })
})
