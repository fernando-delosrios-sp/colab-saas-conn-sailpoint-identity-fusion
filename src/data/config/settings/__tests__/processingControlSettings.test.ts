import type { FusionConfigBuild } from '../../types'
import { applySettings, runtimeDefaults } from '../processingControlSettings'

describe('processingControlSettings applySettings', () => {
    it('defaults deleteEmpty to false when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.deleteEmpty).toBe(false)
    })

    it('normalizes string "true" to boolean true for deleteEmpty', () => {
        const config = { deleteEmpty: 'true' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.deleteEmpty).toBe(true)
    })

    it('normalizes string "false" to boolean false for deleteEmpty', () => {
        const config = { deleteEmpty: 'false' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.deleteEmpty).toBe(false)
    })

    it('defaults skipAccountsWithMissingId to false when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.skipAccountsWithMissingId).toBe(false)
    })

    it('normalizes string "true" to boolean true for skipAccountsWithMissingId', () => {
        const config = { skipAccountsWithMissingId: 'true' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.skipAccountsWithMissingId).toBe(true)
    })

    it('normalizes string "false" to boolean false for skipAccountsWithMissingId', () => {
        const config = { skipAccountsWithMissingId: 'false' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.skipAccountsWithMissingId).toBe(false)
    })

    it('preserves boolean values for deleteEmpty and skipAccountsWithMissingId', () => {
        const config = { deleteEmpty: true, skipAccountsWithMissingId: true } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.deleteEmpty).toBe(true)
        expect(config.skipAccountsWithMissingId).toBe(true)
    })
})