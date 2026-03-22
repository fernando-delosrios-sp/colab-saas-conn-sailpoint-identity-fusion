import { buildFormName, calculateExpirationDate, resolveIdentitiesSelectLabel } from '../helpers'

describe('formService helpers', () => {
    describe('resolveIdentitiesSelectLabel', () => {
        it('prefers attributes.displayName from the identity document (matches search index label)', () => {
            const doc = {
                attributes: { displayName: 'brenda.cooper' },
            } as any
            const label = resolveIdentitiesSelectLabel({}, 'id-1', doc)
            expect(label).toBe('brenda.cooper')
        })

        it('uses fusion attributes when identity document is not provided', () => {
            const label = resolveIdentitiesSelectLabel({ displayName: 'Jane' }, 'id-2')
            expect(label).toBe('Jane')
        })

        it('prefers identity document displayName over stale fusion snapshot', () => {
            const doc = { attributes: { displayName: 'From Index' } } as any
            const label = resolveIdentitiesSelectLabel({ displayName: 'Stale' }, 'id-3', doc)
            expect(label).toBe('From Index')
        })

        it('falls back to identity id when displayName is missing everywhere', () => {
            const label = resolveIdentitiesSelectLabel({}, 'fallback-id')
            expect(label).toBe('fallback-id')
        })
    })

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

        it('should omit account id for orphan source reviews', () => {
            const fusionAccount = {
                name: 'fcooper',
                nativeIdentity: 'aa7459e540f94cbdbaa859019ef5c4f1',
                sourceName: 'Active Directory',
            } as any
            const result = buildFormName(fusionAccount, 'Fusion Review', 'orphan')
            expect(result).toBe('Fusion Review - fcooper [Active Directory]')
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
