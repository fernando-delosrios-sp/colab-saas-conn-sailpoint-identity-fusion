import { isExactAttributeMatchScores } from '../exactMatch'

describe('isExactAttributeMatchScores', () => {
    it('returns false for undefined or empty scores', () => {
        expect(isExactAttributeMatchScores(undefined)).toBe(false)
        expect(isExactAttributeMatchScores([])).toBe(false)
    })

    it('returns false when only synthetic rows exist', () => {
        expect(
            isExactAttributeMatchScores([
                { attribute: 'Combined score', algorithm: 'weighted-mean', score: 95, skipped: false } as any,
            ])
        ).toBe(false)
        expect(isExactAttributeMatchScores([{ algorithm: 'average', score: 100, skipped: false } as any])).toBe(false)
    })

    it('returns false when a real rule was skipped', () => {
        expect(
            isExactAttributeMatchScores([
                { algorithm: 'jaro-winkler', score: 100, skipped: false },
                { algorithm: 'jaro-winkler', score: 100, skipped: true },
            ])
        ).toBe(false)
    })

    it('returns false when any real rule is below 100', () => {
        expect(
            isExactAttributeMatchScores([
                { algorithm: 'jaro-winkler', score: 100, skipped: false },
                { algorithm: 'jaro-winkler', score: 99, skipped: false },
            ])
        ).toBe(false)
    })

    it('returns true when every real rule is 100 and none skipped (synthetic rows ignored)', () => {
        expect(
            isExactAttributeMatchScores([
                { algorithm: 'jaro-winkler', score: 100, skipped: false },
                { algorithm: 'name-matcher', score: 100, skipped: false },
                { algorithm: 'weighted-mean', score: 92, skipped: false },
            ])
        ).toBe(true)
    })

    it('treats missing algorithm as a real rule', () => {
        expect(isExactAttributeMatchScores([{ score: 100, skipped: false }])).toBe(true)
        expect(isExactAttributeMatchScores([{ score: 99, skipped: false }])).toBe(false)
    })
})
