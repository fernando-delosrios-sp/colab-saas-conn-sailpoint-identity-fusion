import { getDateFromISOString, isNewerThan } from '../date'

describe('getDateFromISOString', () => {
    it('should parse valid ISO string', () => {
        const result = getDateFromISOString('2024-01-15T10:30:00.000Z')
        expect(result).toBeInstanceOf(Date)
        expect(result.getUTCFullYear()).toBe(2024)
        expect(result.getUTCMonth()).toBe(0)
        expect(result.getUTCDate()).toBe(15)
    })

    it('should return epoch date for empty string', () => {
        const result = getDateFromISOString('')
        expect(result.getTime()).toBe(0)
    })

    it('should return epoch date for undefined', () => {
        const result = getDateFromISOString(undefined)
        expect(result.getTime()).toBe(0)
    })

    it('should return epoch date for null', () => {
        const result = getDateFromISOString(null as any)
        expect(result.getTime()).toBe(0)
    })
})

describe('isNewerThan', () => {
    it('should return true when first date is newer than reference date', () => {
        expect(isNewerThan('2024-01-16T10:30:00.000Z', '2024-01-15T10:30:00.000Z')).toBe(true)
    })

    it('should return false when first date is older than reference date', () => {
        expect(isNewerThan('2024-01-14T10:30:00.000Z', '2024-01-15T10:30:00.000Z')).toBe(false)
    })

    it('should return false when first date is exactly same as reference date', () => {
        expect(isNewerThan('2024-01-15T10:30:00.000Z', '2024-01-15T10:30:00.000Z')).toBe(false)
    })

    it('should handle empty/falsy isoString correctly (epoch-0 is never newer than valid date)', () => {
        expect(isNewerThan(undefined, '2024-01-15T10:30:00.000Z')).toBe(false)
        expect(isNewerThan(null, '2024-01-15T10:30:00.000Z')).toBe(false)
        expect(isNewerThan('', '2024-01-15T10:30:00.000Z')).toBe(false)
    })

    it('should handle empty/falsy reference correctly (valid date is newer than epoch-0)', () => {
        expect(isNewerThan('2024-01-15T10:30:00.000Z', undefined)).toBe(true)
        expect(isNewerThan('2024-01-15T10:30:00.000Z', null)).toBe(true)
        expect(isNewerThan('2024-01-15T10:30:00.000Z', '')).toBe(true)
    })

    it('should return false when both are empty/falsy', () => {
        expect(isNewerThan(undefined, undefined)).toBe(false)
    })
})
