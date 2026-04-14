import { createFusionDecision } from '../formProcessor'

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
