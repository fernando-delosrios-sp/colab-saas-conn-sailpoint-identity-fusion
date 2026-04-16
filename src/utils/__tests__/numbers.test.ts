import { roundMetric2 } from '../numbers'

describe('roundMetric2', () => {
    it('rounds to 2 decimal places', () => {
        expect(roundMetric2(78.456)).toBe(78.46)
        expect(roundMetric2(56)).toBe(56)
    })
})
