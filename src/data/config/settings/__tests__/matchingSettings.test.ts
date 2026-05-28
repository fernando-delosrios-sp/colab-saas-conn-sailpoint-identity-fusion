import { readSettings } from '../matchingSettings'

describe('matchingSettings readSettings', () => {
    it('defaults fusionMergingExactMatch to false when omitted', () => {
        const raw = { matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }] }

        const result = readSettings(raw)

        expect(result.fusionMergingExactMatch).toBe(false)
    })

    it('normalizes string "true" to boolean true for fusionMergingExactMatch', () => {
        const raw = {
            fusionMergingExactMatch: 'true' as unknown as boolean,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionMergingExactMatch).toBe(true)
    })

    it('normalizes string "false" to boolean false for fusionMergingExactMatch', () => {
        const raw = {
            fusionMergingExactMatch: 'false' as unknown as boolean,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionMergingExactMatch).toBe(false)
    })

    it('preserves boolean false for fusionMergingExactMatch', () => {
        const raw = {
            fusionMergingExactMatch: false,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionMergingExactMatch).toBe(false)
    })
})