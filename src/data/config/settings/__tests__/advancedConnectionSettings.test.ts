import type { FusionConfigBuild } from '../../types'
import { applySettings, connectorSpecInitialValues } from '../advancedConnectionSettings'

describe('advancedConnectionSettings applySettings', () => {
    it('defaults enableQueue to true when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.enableQueue).toBe(true)
    })

    it('normalizes string "false" to boolean false for enableQueue', () => {
        const config = { enableQueue: 'false' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.enableQueue).toBe(false)
    })

    it('normalizes string "true" to boolean true for enableQueue', () => {
        const config = { enableQueue: 'true' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.enableQueue).toBe(true)
    })

    it('defaults enableRetry to true when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.enableRetry).toBe(true)
    })

    it('normalizes string "false" to boolean false for enableRetry', () => {
        const config = { enableRetry: 'false' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.enableRetry).toBe(false)
    })

    it('defaults enablePriority to true when omitted', () => {
        const config = {} as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.enablePriority).toBe(true)
    })

    it('normalizes string "false" to boolean false for enablePriority', () => {
        const config = { enablePriority: 'false' as unknown as boolean } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.enablePriority).toBe(false)
    })

    it('preserves boolean values for enableQueue', () => {
        const config = { enableQueue: false } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.enableQueue).toBe(false)
    })
})