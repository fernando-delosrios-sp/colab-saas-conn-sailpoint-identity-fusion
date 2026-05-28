import { readSettings } from '../matchingSettings'

describe('matchingSettings readSettings', () => {
    it('defaults fusionEnableAutoAssignment to false when omitted', () => {
        const raw = { matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }] }

        const result = readSettings(raw)

        expect(result.fusionEnableAutoAssignment).toBe(false)
    })

    it('normalizes string "true" to boolean true for fusionEnableAutoAssignment', () => {
        const raw = {
            fusionEnableAutoAssignment: 'true' as unknown as boolean,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionEnableAutoAssignment).toBe(true)
    })

    it('normalizes string "false" to boolean false for fusionEnableAutoAssignment', () => {
        const raw = {
            fusionEnableAutoAssignment: 'false' as unknown as boolean,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionEnableAutoAssignment).toBe(false)
    })

    it('preserves boolean false for fusionEnableAutoAssignment', () => {
        const raw = {
            fusionEnableAutoAssignment: false,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionEnableAutoAssignment).toBe(false)
    })
})