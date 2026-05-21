import type { FusionConfigBuild } from '../../types'
import { applySettings, runtimeDefaults } from '../matchingSettings'

describe('matchingSettings applySettings', () => {
    it('defaults fusionMergingExactMatch to false when omitted', () => {
        const config = { matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }] } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.fusionMergingExactMatch).toBe(false)
    })

    it('normalizes string "true" to boolean true for fusionMergingExactMatch', () => {
        const config = {
            fusionMergingExactMatch: 'true' as unknown as boolean,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.fusionMergingExactMatch).toBe(true)
    })

    it('normalizes string "false" to boolean false for fusionMergingExactMatch', () => {
        const config = {
            fusionMergingExactMatch: 'false' as unknown as boolean,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.fusionMergingExactMatch).toBe(false)
    })

    it('preserves boolean false for fusionMergingExactMatch', () => {
        const config = {
            fusionMergingExactMatch: false,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.fusionMergingExactMatch).toBe(false)
    })
})