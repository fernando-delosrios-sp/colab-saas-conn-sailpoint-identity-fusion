import {
    format,
    parse,
    addDays,
    addMonths,
    addYears,
    subDays,
    subMonths,
    subYears,
    isBefore,
    isAfter,
    isEqual,
    differenceInDays,
    startOfDay,
    endOfDay,
    now,
    isValid,
} from '../contextHelpers/dateUtils'

describe('attributeService dateUtils', () => {
    const testDate = new Date('2024-01-15T12:30:45.000Z')

    describe('format', () => {
        it('should format with yyyy-MM-dd', () => {
            expect(format(testDate, 'yyyy-MM-dd')).toBe('2024-01-15')
        })

        it('should format with yy', () => {
            expect(format(testDate, 'yy')).toBe('24')
        })

        it('should format with MM and dd', () => {
            expect(format(testDate, 'MM/dd')).toBe('01/15')
        })

        it('should return ISO when no format string', () => {
            const result = format(testDate)
            expect(result).toContain('2024')
        })

        it('should throw for invalid date', () => {
            expect(() => format('invalid')).toThrow('Invalid date')
        })

        it('should format timezone tokens correctly as UTC', () => {
            const d = new Date(Date.UTC(2024, 0, 15, 12, 0, 0))
            expect(format(d, "yyyy-MM-dd'T'HH:mm:ssXXX")).toBe('2024-01-15T12:00:00Z')
            expect(format(d, "yyyy-MM-dd HH:mmxxx")).toBe('2024-01-15 12:00+00:00')
            expect(format(d, "yyyy-MM-dd HH:mmxx")).toBe('2024-01-15 12:00+0000')
            expect(format(d, 'yyyy-MM-dd HH:mmx')).toBe('2024-01-15 12:00+00')
        })
    })

    describe('parse', () => {
        it('should parse ISO string', () => {
            const d = parse('2024-01-15')
            expect(d.getUTCFullYear()).toBe(2024)
        })

        it('should throw for invalid date', () => {
            expect(() => parse('not-a-date')).toThrow('Invalid date')
        })

        it('should parse date with timezone offsets correctly', () => {
            // Z offset
            const d1 = parse('2024-01-15T12:00:00Z', "yyyy-MM-dd'T'HH:mm:ssXXX")
            expect(d1.getUTCDate()).toBe(15)
            expect(d1.getUTCHours()).toBe(12)

            // Positive offset (+02:00) -> 12:00 local time is 10:00 UTC
            const d2 = parse('2024-01-15T12:00:00+02:00', "yyyy-MM-dd'T'HH:mm:ssXXX")
            expect(d2.getUTCDate()).toBe(15)
            expect(d2.getUTCHours()).toBe(10)

            // Negative offset (-0500) -> 12:00 local time is 17:00 UTC
            const d3 = parse('2024-01-15T12:00:00-0500', "yyyy-MM-dd'T'HH:mm:ssXX")
            expect(d3.getUTCDate()).toBe(15)
            expect(d3.getUTCHours()).toBe(17)

            // Hours-only offset (+02) -> 12:00 local time is 10:00 UTC
            const d4 = parse('2024-01-15 12:00+02', 'yyyy-MM-dd HH:mmX')
            expect(d4.getUTCDate()).toBe(15)
            expect(d4.getUTCHours()).toBe(10)
        })
    })

    describe('addDays', () => {
        it('should add days', () => {
            const result = addDays('2024-01-15', 10)
            expect(result.getUTCDate()).toBe(25)
        })
    })

    describe('subDays', () => {
        it('should subtract days', () => {
            const result = subDays('2024-01-25', 10)
            expect(result.getUTCDate()).toBe(15)
        })
    })

    describe('addMonths', () => {
        it('should add months', () => {
            const result = addMonths('2024-01-15', 3)
            expect(result.getUTCMonth()).toBe(3)
        })
    })

    describe('addYears', () => {
        it('should add years', () => {
            const result = addYears('2024-01-15', 2)
            expect(result.getUTCFullYear()).toBe(2026)
        })
    })

    describe('subMonths / subYears', () => {
        it('should subtract months', () => {
            const result = subMonths('2024-04-15', 2)
            expect(result.getUTCMonth()).toBe(1)
        })

        it('should subtract years', () => {
            const result = subYears('2026-01-15', 2)
            expect(result.getUTCFullYear()).toBe(2024)
        })
    })

    describe('isBefore / isAfter / isEqual', () => {
        it('should compare dates correctly', () => {
            expect(isBefore('2024-01-01', '2024-01-15')).toBe(true)
            expect(isAfter('2024-01-15', '2024-01-01')).toBe(true)
            expect(isEqual('2024-01-15', '2024-01-15')).toBe(true)
        })
    })

    describe('differenceInDays', () => {
        it('should calculate difference', () => {
            expect(differenceInDays('2024-01-25', '2024-01-15')).toBe(10)
        })

        it('should calculate calendar day difference across DST and midnight shifts', () => {
            expect(differenceInDays('2024-01-16T12:00:00Z', '2024-01-15T15:00:00Z')).toBe(1)
            expect(differenceInDays('2024-01-15T23:59:59Z', '2024-01-15T00:00:00Z')).toBe(0)
            expect(differenceInDays('2024-01-16T00:00:00Z', '2024-01-15T23:59:59Z')).toBe(1)
        })
    })

    describe('startOfDay / endOfDay', () => {
        it('should set start of day', () => {
            const d = startOfDay('2024-01-15T12:30:00')
            expect(d.getUTCHours()).toBe(0)
            expect(d.getUTCMinutes()).toBe(0)
        })

        it('should set end of day', () => {
            const d = endOfDay('2024-01-15')
            expect(d.getUTCHours()).toBe(23)
            expect(d.getUTCMinutes()).toBe(59)
        })
    })

    describe('now', () => {
        it('should return current date', () => {
            const before = Date.now()
            const result = now()
            const after = Date.now()
            expect(result.getTime()).toBeGreaterThanOrEqual(before)
            expect(result.getTime()).toBeLessThanOrEqual(after + 1000)
        })
    })

    describe('isValid', () => {
        it('should return true for valid date', () => {
            expect(isValid('2024-01-15')).toBe(true)
        })

        it('should return false for invalid date', () => {
            expect(isValid('invalid')).toBe(false)
        })
    })
})
