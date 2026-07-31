import {
    compareOutputs,
    normalizeAccountCompareField,
    sanitizeHistoryDates,
    accountOutputSortKey,
    sortAccountOutputs,
    isMidChainAccountListStep,
    isPlainObject,
} from '../compareOutputs'

describe('compareOutputs', () => {
    it('returns match when expected is null or undefined', () => {
        expect(compareOutputs([], null, 'step-1')).toEqual({ match: true, drift: [] })
        expect(compareOutputs([], undefined, 'step-1')).toEqual({ match: true, drift: [] })
    })

    it('detects missing outputs', () => {
        const { match, drift } = compareOutputs([], { attributes: { id: 'a' } }, 'step-1')
        expect(match).toBe(false)
        expect(drift).toContain('step-1: expected output but got none')
    })

    it('detects attribute drift', () => {
        const actual = [{ attributes: { id: 'changed' } }]
        const expected = { attributes: { id: 'original' } }
        const { match, drift } = compareOutputs(actual, expected, 'step-1')
        expect(match).toBe(false)
        expect(drift.length).toBeGreaterThan(0)
    })

    it('sorts account outputs by id before comparing', () => {
        const actual = [
            { key: { simple: { id: 'b' } }, attributes: { id: 'b' } },
            { key: { simple: { id: 'a' } }, attributes: { id: 'a' } },
        ]
        const expected = [
            { key: { simple: { id: 'a' } }, attributes: { id: 'a' } },
            { key: { simple: { id: 'b' } }, attributes: { id: 'b' } },
        ]
        const { match } = compareOutputs(actual, expected, 'step-1')
        expect(match).toBe(true)
    })
})

describe('compareOutputs helpers', () => {
    it('normalizeAccountCompareField maps auto status to nonMatched', () => {
        expect(normalizeAccountCompareField('statuses', ['auto', 'matched'])).toEqual(['matched', 'nonMatched'])
    })

    it('sanitizeHistoryDates replaces date prefixes in history strings', () => {
        const input = { history: ['[2024-01-01] merged account'] }
        expect(sanitizeHistoryDates(input)).toEqual({ history: ['[DATE] merged account'] })
    })

    it('accountOutputSortKey prefers key.simple.id', () => {
        expect(accountOutputSortKey({ key: { simple: { id: 'NG001' } } })).toBe('NG001')
    })

    it('sortAccountOutputs orders by account id', () => {
        const sorted = sortAccountOutputs([
            { attributes: { id: 'z' } },
            { attributes: { id: 'a' } },
        ])
        expect(sorted.map((item) => accountOutputSortKey(item))).toEqual(['a', 'z'])
    })

    it('isMidChainAccountListStep excludes first and step 23', () => {
        expect(isMidChainAccountListStep('step-1 (index 0)')).toBe(false)
        expect(isMidChainAccountListStep('step-23 (index 22)')).toBe(false)
        expect(isMidChainAccountListStep('step-5 (index 4)')).toBe(true)
    })

    it('isPlainObject distinguishes objects from arrays', () => {
        expect(isPlainObject({ a: 1 })).toBe(true)
        expect(isPlainObject([])).toBe(false)
        expect(isPlainObject(null)).toBe(false)
    })
})
