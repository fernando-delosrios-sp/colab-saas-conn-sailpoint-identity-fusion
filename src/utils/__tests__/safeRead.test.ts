import {
    asRecord,
    isRecord,
    readArray,
    readBoolean,
    readNumber,
    readPathNumber,
    readPathString,
    readPathUnknown,
    readString,
    readUnknown,
} from '../safeRead'

describe('safeRead', () => {
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
})
