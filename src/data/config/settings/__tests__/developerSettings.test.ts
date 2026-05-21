import type { FusionConfigBuild } from '../../types'
import { applySettings, runtimeDefaults } from '../developerSettings'

describe('developerSettings applySettings', () => {
    it('defaults reset to false when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.reset).toBe(false)
    })

    it('normalizes string "true" to boolean true for reset', () => {
        const config = { reset: 'true' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.reset).toBe(true)
    })

    it('normalizes string "false" to boolean false for reset', () => {
        const config = { reset: 'false' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.reset).toBe(false)
    })

    it('defaults concurrencyCheckEnabled to true when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.concurrencyCheckEnabled).toBe(true)
    })

    it('normalizes string "false" to boolean false for concurrencyCheckEnabled', () => {
        const config = { concurrencyCheckEnabled: 'false' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.concurrencyCheckEnabled).toBe(false)
    })

    it('defaults forceAttributeRefresh to false when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.forceAttributeRefresh).toBe(false)
    })

    it('normalizes string "true" to boolean true for forceAttributeRefresh', () => {
        const config = { forceAttributeRefresh: 'true' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.forceAttributeRefresh).toBe(true)
    })

    it('defaults externalLoggingEnabled to false when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.externalLoggingEnabled).toBe(false)
    })

    it('normalizes string "true" to boolean true for externalLoggingEnabled', () => {
        const config = { externalLoggingEnabled: 'true' as unknown as boolean, externalLoggingUrl: 'http://localhost' } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.externalLoggingEnabled).toBe(true)
    })
})