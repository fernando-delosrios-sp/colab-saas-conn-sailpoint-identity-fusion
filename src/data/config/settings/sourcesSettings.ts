/**
 * connector-spec.json -> Source Settings -> Sources
 */
import type { SourceConfig } from '../../../model/config'
import { assert, softAssert } from '../../../utils/assert'
import { readBoolean } from '../../../utils/safeRead'
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    aggregationMode: 'none' as const,
    correlationMode: 'none' as const,
    aggregationTimeout: 10,
} as const

export const runtimeDefaults = {
    source: {
        enabled: true,
        aggregationMode: 'none' as const,
        aggregationTimeoutMinutes: 10,
        aggregationDelay: 5,
        optimizedAggregation: true,
        correlationMode: 'none' as const,
        deferredMatching: true,
    },
} as const

export function applySettings(config: FusionConfigBuild): void {
    config.sources = config.sources ?? []

    config.sources = config.sources
        .map((sourceConfig: SourceConfig) => {
            assert(sourceConfig, 'Source configuration is required')
            assert(sourceConfig.name, 'Source name is required')
            if (readBoolean(sourceConfig, 'forceAggregation', false) && !sourceConfig.aggregationMode) {
                sourceConfig.aggregationMode = 'before'
            }
            const rawTimeout =
                sourceConfig.aggregationTimeout ?? runtimeDefaults.source.aggregationTimeoutMinutes
            const aggregationTimeout =
                typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout >= 0
                    ? rawTimeout
                    : runtimeDefaults.source.aggregationTimeoutMinutes
            return {
                ...sourceConfig,
                enabled: sourceConfig.enabled ?? runtimeDefaults.source.enabled,
                aggregationMode: sourceConfig.aggregationMode ?? runtimeDefaults.source.aggregationMode,
                aggregationTimeout,
                aggregationDelay: sourceConfig.aggregationDelay ?? runtimeDefaults.source.aggregationDelay,
                optimizedAggregation:
                    sourceConfig.optimizedAggregation ?? runtimeDefaults.source.optimizedAggregation,
                accountFilter: sourceConfig.accountFilter ?? undefined,
                accountJmespathFilter: sourceConfig.accountJmespathFilter ?? undefined,
                correlationMode: sourceConfig.correlationMode ?? runtimeDefaults.source.correlationMode,
                deferredMatching: sourceConfig.deferredMatching ?? runtimeDefaults.source.deferredMatching,
            }
        })
        .filter((sourceConfig: SourceConfig) => sourceConfig.enabled)

    softAssert(config.sources.length > 0, 'No sources configured - no Match will be performed', 'warn')
}
