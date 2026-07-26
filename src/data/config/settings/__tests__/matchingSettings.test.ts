import { readSettings } from '../matchingSettings'

describe('matchingSettings readSettings', () => {
    it('defaults fusionEnableAutoMerge to false when omitted', () => {
        const raw = { matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }] }

        const result = readSettings(raw)

        expect(result.fusionEnableAutoMerge).toBe(false)
    })

    it('normalizes string "true" to boolean true for fusionEnableAutoMerge', () => {
        const raw = {
            fusionEnableAutoMerge: 'true' as unknown as boolean,
            fusionAutoMergeScore: 100,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionEnableAutoMerge).toBe(true)
    })

    it('normalizes string "false" to boolean false for fusionEnableAutoMerge', () => {
        const raw = {
            fusionEnableAutoMerge: 'false' as unknown as boolean,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionEnableAutoMerge).toBe(false)
    })

    it('migrates legacy fusionEnableAutoAssignment to fusionEnableAutoMerge', () => {
        const raw = {
            fusionEnableAutoAssignment: true,
            fusionAutoAssignmentScore: 95,
            fusionManualReviewScore: 80,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        }

        const result = readSettings(raw)

        expect(result.fusionEnableAutoMerge).toBe(true)
        expect(result.fusionAutoMergeScore).toBe(95)
    })
})
