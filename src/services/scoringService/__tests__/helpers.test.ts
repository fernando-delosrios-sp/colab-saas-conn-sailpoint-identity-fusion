import {
    scoreCustomVelocity,
    scoreDice,
    scoreDoubleMetaphone,
    scoreJaroWinkler,
    scoreLIG3,
    scoreNameMatcher,
} from '../helpers'

const baseMatching = {
    attribute: 'displayName',
    fusionScore: 80,
}

describe('scoringService helpers', () => {
    describe('scoreDice', () => {
        it('should return 100 for identical strings', () => {
            const result = scoreDice('hello', 'hello', baseMatching)
            expect(result.score).toBe(100)
            expect(result.isMatch).toBe(true)
        })

        it('should return 0 when both strings are empty', () => {
            const result = scoreDice('', '', { ...baseMatching, fusionScore: 100 })
            expect(result.score).toBe(0)
            expect(result.isMatch).toBe(false)
        })

        it('should respect fusionScore threshold', () => {
            const result = scoreDice('abc', 'xyz', { ...baseMatching, fusionScore: 80 })
            expect(result.isMatch).toBe(result.score >= 80)
        })
    })

    describe('scoreJaroWinkler', () => {
        it('should return 100 for identical strings', () => {
            const result = scoreJaroWinkler('matching', 'matching', baseMatching)
            expect(result.score).toBe(100)
        })

        it('should return 0 when both strings are empty', () => {
            const result = scoreJaroWinkler('', '', { ...baseMatching, fusionScore: 100 })
            expect(result.score).toBe(0)
            expect(result.isMatch).toBe(false)
        })
    })

    describe('scoreDoubleMetaphone', () => {
        it('should return 100 for primary code match', () => {
            const result = scoreDoubleMetaphone('Smith', 'Smith', baseMatching)
            expect(result.score).toBe(100)
            expect(result.comment).toContain('Primary')
        })

        it('should handle phonetically similar names', () => {
            const result = scoreDoubleMetaphone('Smith', 'Smyth', baseMatching)
            expect(result.score).toBeGreaterThan(0)
        })

        it('should give partial credit for near metaphone codes', () => {
            const result = scoreDoubleMetaphone('Alvin', 'Calvin', baseMatching)
            expect(result.score).toBeGreaterThan(0)
        })

        it('should return 0 and comment for no match', () => {
            const result = scoreDoubleMetaphone('Apple', 'Banana', baseMatching)
            expect(result.score).toBe(0)
            expect(result.comment).toContain('No phonetic match')
        })
    })

    describe('scoreNameMatcher', () => {
        it('should return 100 for identical names', () => {
            const result = scoreNameMatcher('John Smith', 'John Smith', baseMatching)
            expect(result.score).toBe(100)
        })

        it('should handle name order differences', () => {
            const result = scoreNameMatcher('John Smith', 'Smith John', baseMatching)
            expect(result.score).toBeGreaterThan(80)
        })
    })

    describe('scoreLIG3', () => {
        it('should return 100 for exact match', () => {
            const result = scoreLIG3('John Smith', 'John Smith', baseMatching)
            expect(result.score).toBe(100)
            expect(result.comment).toBe('Exact match')
        })

        it('should return 0 for empty comparison', () => {
            const result = scoreLIG3('', 'test', baseMatching)
            expect(result.score).toBe(0)
        })

        it('should return 0 when both sides are empty (not a 100% match)', () => {
            const result = scoreLIG3('', '', { ...baseMatching, fusionScore: 100 })
            expect(result.score).toBe(0)
            expect(result.isMatch).toBe(false)
        })

        it('should handle typos with moderate score', () => {
            const result = scoreLIG3('John', 'Jhon', baseMatching)
            expect(result.score).toBeGreaterThan(0)
        })

        it('should be case insensitive', () => {
            const result = scoreLIG3('JOHN', 'john', baseMatching)
            expect(result.score).toBe(100)
        })
    })

    describe('scoreCustomVelocity', () => {
        const customBase = {
            ...baseMatching,
            algorithm: 'custom' as const,
            attribute: 'email',
        }

        it('parses numeric literal output from Velocity', () => {
            const result = scoreCustomVelocity('x', 'y', {
                ...customBase,
                customVelocityExpression: '77',
                fusionScore: 70,
            })
            expect(result.score).toBe(77)
            expect(result.isMatch).toBe(true)
        })

        it('clamps score to 0–100', () => {
            const hi = scoreCustomVelocity('a', 'b', {
                ...customBase,
                customVelocityExpression: '150',
                fusionScore: 0,
            })
            expect(hi.score).toBe(100)

            const lo = scoreCustomVelocity('a', 'b', {
                ...customBase,
                customVelocityExpression: '-40',
                fusionScore: 0,
            })
            expect(lo.score).toBe(0)
        })

        it('exposes $attribute in context', () => {
            const result = scoreCustomVelocity('x', 'y', {
                ...customBase,
                customVelocityExpression: '$attribute.length',
                fusionScore: 1,
            })
            expect(result.score).toBe(5)
        })

        it('exposes $candidateValue (fusion identity side)', () => {
            const result = scoreCustomVelocity('a', 'bb', {
                ...customBase,
                customVelocityExpression: '$candidateValue.length',
                fusionScore: 1,
            })
            expect(result.score).toBe(2)
        })

        it('returns 0 with comment when output is not a number', () => {
            const result = scoreCustomVelocity('a', 'b', {
                ...customBase,
                customVelocityExpression: 'not-a-number',
                fusionScore: 50,
            })
            expect(result.score).toBe(0)
            expect(result.isMatch).toBe(false)
            expect(result.comment).toContain('not a valid number')
        })
    })
})
