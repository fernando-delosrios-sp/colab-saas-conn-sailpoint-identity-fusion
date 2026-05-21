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

    it('defaults deferredMatching to true when omitted', () => {
        const config = {
            sources: [{ name: 'A', enabled: true }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].deferredMatching).toBe(true)
    })

    it('normalizes string "false" to boolean false for deferredMatching', () => {
        const config = {
            sources: [{ name: 'A', enabled: true, deferredMatching: 'false' as unknown as boolean }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].deferredMatching).toBe(false)
    })

    it('normalizes string "true" to boolean true for deferredMatching', () => {
        const config = {
            sources: [{ name: 'A', enabled: true, deferredMatching: 'true' as unknown as boolean }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].deferredMatching).toBe(true)
    })

    it('normalizes string "false" to boolean false for enabled (excludes source)', () => {
        const config = {
            sources: [{ name: 'A', enabled: 'false' as unknown as boolean }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources).toHaveLength(0)
    })

    it('normalizes string "true" to boolean true for enabled', () => {
        const config = {
            sources: [{ name: 'A', enabled: 'true' as unknown as boolean }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources).toHaveLength(1)
        expect(config.sources![0].enabled).toBe(true)
    })

    it('normalizes string "false" to boolean false for optimizedAggregation', () => {
        const config = {
            sources: [{ name: 'A', enabled: true, optimizedAggregation: 'false' as unknown as boolean }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].optimizedAggregation).toBe(false)
    })

    it('normalizes string "true" to boolean true for optimizedAggregation', () => {
        const config = {
            sources: [{ name: 'A', enabled: true, optimizedAggregation: 'true' as unknown as boolean }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].optimizedAggregation).toBe(true)
    })

    it('normalizes string "false" to boolean false for includeRecordAccountsForMatching', () => {
        const config = {
            sources: [{ name: 'A', enabled: true, includeRecordAccountsForMatching: 'false' as unknown as boolean }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].includeRecordAccountsForMatching).toBe(false)
    })

    it('defaults includeRecordAccountsForMatching to true when omitted', () => {
        const config = {
            sources: [{ name: 'A', enabled: true }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].includeRecordAccountsForMatching).toBe(true)
    })

    it('normalizes string "true" to boolean true for disableNonMatchingAccounts', () => {
        const config = {
            sources: [{ name: 'A', enabled: true, sourceType: 'orphan', disableNonMatchingAccounts: 'true' as unknown as boolean }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].disableNonMatchingAccounts).toBe(true)
    })

    it('defaults disableNonMatchingAccounts to false when omitted', () => {
        const config = {
            sources: [{ name: 'A', enabled: true }],
        } as unknown as FusionConfigBuild

        applySettings(config)

        expect(config.sources![0].disableNonMatchingAccounts).toBe(false)
    })
})