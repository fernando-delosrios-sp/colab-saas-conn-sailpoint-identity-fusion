import type { FusionConfigBuild } from '../../types'
import { applySettings, runtimeDefaults } from '../sourcesSettings'

describe('sourcesSettings applySettings', () => {
    it('defaults aggregationTimeout to 10 minutes per source when unset', () => {
        const config = {
            sources: [{ name: 'A', enabled: true }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].aggregationTimeout).toBe(runtimeDefaults.source.aggregationTimeoutMinutes)
    })

    it('uses configured aggregationTimeout when valid', () => {
        const config = {
            sources: [{ name: 'A', enabled: true, aggregationTimeout: 25 }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].aggregationTimeout).toBe(25)
    })

    it('falls back to default when aggregationTimeout is not a finite number', () => {
        const config = {
            sources: [{ name: 'A', enabled: true, aggregationTimeout: NaN as unknown as number }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].aggregationTimeout).toBe(runtimeDefaults.source.aggregationTimeoutMinutes)
    })
})
