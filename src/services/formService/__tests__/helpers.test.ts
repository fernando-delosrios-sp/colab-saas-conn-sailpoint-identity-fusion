import { buildFormName, calculateExpirationDate } from '../helpers'

describe('formService helpers', () => {
    describe('buildFormName', () => {
        it('should build form name from fusion account', () => {
            const fusionAccount = {
                name: 'John Doe',
                displayName: 'John Doe',
                nativeIdentity: 'acc-123',
                sourceName: 'HR Source',
            } as any
            const result = buildFormName(fusionAccount, 'Fusion Review')
            expect(result).toBe('Fusion Review - John Doe (acc-123) [HR Source]')
        })

        it('should use displayName when name is missing', () => {
            const fusionAccount = {
                displayName: 'Jane Smith',
                nativeIdentity: 'acc-999',
                sourceName: 'IT',
            } as any
            const result = buildFormName(fusionAccount, 'Review')
            expect(result).toBe('Review - Jane Smith (acc-999) [IT]')
        })

        it('should use Unknown when both name and displayName missing', () => {
            const fusionAccount = { sourceName: 'S', managedAccountId: 'managed-1' } as any
            const result = buildFormName(fusionAccount, 'F')
            expect(result).toBe('F - Unknown (managed-1) [S]')
        })

        it('should use UnknownId when no account identifier is present', () => {
            const fusionAccount = { sourceName: 'S' } as any
            const result = buildFormName(fusionAccount, 'F')
            expect(result).toBe('F - Unknown (UnknownId) [S]')
        })
    })

    describe('calculateExpirationDate', () => {
        it('should add days to current date', () => {
            const base = new Date('2024-01-15')
            jest.useFakeTimers()
            jest.setSystemTime(base)

            const result = calculateExpirationDate(10)
            const expected = new Date(base)
            expected.setDate(expected.getDate() + 10)
            expect(new Date(result).toDateString()).toBe(expected.toDateString())

            jest.useRealTimers()
        })
    })
})
