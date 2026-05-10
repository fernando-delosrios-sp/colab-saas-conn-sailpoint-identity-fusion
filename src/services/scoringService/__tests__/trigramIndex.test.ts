import { FusionAccount } from '../../../model/account'
import { extractTrigrams, buildAttributeIndex, queryAttributeIndex } from '../trigramIndex'

describe('trigramIndex', () => {
    describe('extractTrigrams', () => {
        it('extracts trigrams correctly', () => {
            const trigrams = extractTrigrams('foo')
            expect(trigrams).toEqual(new Set(['  f', ' fo', 'foo', 'oo ']))
        })

        it('handles short strings', () => {
            const trigrams = extractTrigrams('a')
            expect(trigrams).toEqual(new Set(['  a', ' a ']))
        })

        it('handles empty strings', () => {
            const trigrams = extractTrigrams('')
            expect(trigrams).toEqual(new Set(['   ']))
        })
    })

    describe('buildAttributeIndex', () => {
        it('builds an index correctly with multiple identities sharing trigrams', () => {
            const account1 = { attributes: { email: 'foo@example.com' } } as unknown as FusionAccount
            const account2 = { attributes: { email: 'foo@test.com' } } as unknown as FusionAccount

            const index = buildAttributeIndex([account1, account2], 'email')
            expect(index.size).toBeGreaterThan(0)

            // Both accounts share the 'foo' trigram, so they should be in the same bucket
            const fooBucket = index.get('foo')
            expect(fooBucket).toBeDefined()
            expect(fooBucket?.has(account1)).toBe(true)
            expect(fooBucket?.has(account2)).toBe(true)
        })

        it('ignores missing or empty attributes', () => {
            const account1 = { attributes: {} } as unknown as FusionAccount
            const account2 = { attributes: { email: '' } } as unknown as FusionAccount
            const account3 = { attributes: { email: null } } as unknown as FusionAccount

            const index = buildAttributeIndex([account1, account2, account3], 'email')
            expect(index.size).toBe(0)
        })
    })

    describe('queryAttributeIndex', () => {
        it('queries the index correctly and returns matching identities', () => {
            const account1 = { attributes: { email: 'foo@example.com' } } as unknown as FusionAccount
            const account2 = { attributes: { email: 'bar@example.com' } } as unknown as FusionAccount

            const index = buildAttributeIndex([account1, account2], 'email')

            // Query with a string that shares trigrams with account1 but not account2
            const result = queryAttributeIndex(index, 'foo')
            expect(result).toEqual(new Set([account1]))
        })

        it('returns empty set for no match', () => {
            const account1 = { attributes: { email: 'foo@example.com' } } as unknown as FusionAccount

            const index = buildAttributeIndex([account1], 'email')

            // 'baz' has trigrams: '  b', ' ba', 'baz', 'az ' (none of which are in foo@example.com)
            const result = queryAttributeIndex(index, 'baz')
            expect(result.size).toBe(0)
        })

        it('handles multiple shared trigrams without duplicating candidates', () => {
            const account1 = { attributes: { email: 'foo@example.com' } } as unknown as FusionAccount

            const index = buildAttributeIndex([account1], 'email')

            // Exact query should match multiple trigrams ('  f', ' fo', 'foo')
            // but candidates should still only contain account1 once
            const result = queryAttributeIndex(index, 'foo@example.com')
            expect(result).toEqual(new Set([account1]))
        })
    })
})
