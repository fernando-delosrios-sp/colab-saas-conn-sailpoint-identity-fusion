import {
    asRecord,
    coerceBoolean,
    hasValue,
    isDefined,
    isNullish,
    missing,
    isRecord,
    readArray,
    readBoolean,
    readNumber,
    readPathNumber,
    readPathString,
    readPathUnknown,
    readString,
    readUnknown,
    trimStr,
} from '../safeRead'

describe('safeRead', () => {
    it('classifies nullish and attribute presence', () => {
        expect(isNullish(null)).toBe(true)
        expect(isNullish(undefined)).toBe(true)
        expect(isNullish(0)).toBe(false)
        expect(isDefined(0)).toBe(true)
        expect(hasValue('x')).toBe(true)
        expect(hasValue('  x  ')).toBe(true)
        expect(hasValue(0)).toBe(true)
        expect(hasValue(false)).toBe(true)
        expect(hasValue('')).toBe(false)
        expect(hasValue('   ')).toBe(false)
        expect(hasValue(undefined)).toBe(false)
        expect(hasValue({})).toBe(true)
        expect(missing('')).toBe(true)
        expect(missing('a')).toBe(false)
        expect(trimStr('  a  ')).toBe('a')
        expect(trimStr('   ')).toBeUndefined()
        expect(trimStr(null)).toBeUndefined()
    })

    it('narrows record-like values', () => {
        expect(isRecord({ a: 1 })).toBe(true)
        expect(isRecord(null)).toBe(false)
        expect(isRecord([1, 2, 3])).toBe(false)
        expect(asRecord({ a: 1 })).toEqual({ a: 1 })
        expect(asRecord(undefined)).toBeUndefined()
    })

    it('reads scalar values with fallback support', () => {
        const source = { s: 'ok', n: 10, b: true, notString: 42 }
        expect(readString(source, 's')).toBe('ok')
        expect(readString(source, 'missing')).toBeUndefined()
        expect(readString(source, 'missing', 'fallback')).toBe('fallback')
        expect(readString(source, 'notString', 'fallback')).toBe('fallback')

        expect(readNumber(source, 'n')).toBe(10)
        expect(readNumber(source, 'missing', 3)).toBe(3)
        expect(readBoolean(source, 'b')).toBe(true)
        expect(readBoolean(source, 'missing', false)).toBe(false)
    })

    it('reads arrays and unknown values safely', () => {
        const source = { ids: ['a', 'b'], obj: { x: 1 } }
        expect(readUnknown(source, 'obj')).toEqual({ x: 1 })
        expect(readUnknown(undefined, 'obj')).toBeUndefined()
        expect(readArray<string>(source, 'ids')).toEqual(['a', 'b'])
        expect(readArray<string>(source, 'none', [])).toEqual([])
    })

    it('reads nested paths safely', () => {
        const source = {
            account: {
                key: { simple: { id: 'abc-123' } },
                stats: { total: 2 },
            },
        }
        expect(readPathUnknown(source, ['account', 'key', 'simple', 'id'])).toBe('abc-123')
        expect(readPathString(source, ['account', 'key', 'simple', 'id'])).toBe('abc-123')
        expect(readPathString(source, ['account', 'missing'], 'n/a')).toBe('n/a')
        expect(readPathNumber(source, ['account', 'stats', 'total'])).toBe(2)
        expect(readPathNumber(source, ['account', 'stats', 'missing'], 0)).toBe(0)
    })

    describe('coerceBoolean', () => {
        it('returns boolean values unchanged', () => {
            expect(coerceBoolean(true)).toBe(true)
            expect(coerceBoolean(false)).toBe(false)
        })

        it('normalizes string "true" and "false" to booleans', () => {
            expect(coerceBoolean('true')).toBe(true)
            expect(coerceBoolean('false')).toBe(false)
        })

        it('returns undefined for unrecognized values', () => {
            expect(coerceBoolean(undefined)).toBeUndefined()
            expect(coerceBoolean(null)).toBeUndefined()
            expect(coerceBoolean('yes')).toBeUndefined()
            expect(coerceBoolean('no')).toBeUndefined()
            expect(coerceBoolean(1)).toBeUndefined()
            expect(coerceBoolean(0)).toBeUndefined()
        })
    })
})
