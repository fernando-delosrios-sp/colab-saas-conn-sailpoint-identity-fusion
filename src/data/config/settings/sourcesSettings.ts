/**
 * connector-spec.json -> Source Settings -> Sources
 */
import type { SourceConfig, SourcesSection } from '../../../model/config'
import { assert, softAssert } from './assertLite'
import { extractBoolean } from '../../../utils/attributes'
import { readBoolean } from '../../../utils/safeRead'

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
        includeRecordAccountsForMatching: true,
        disableNonMatchingAccounts: false,
    },
} as const

export function readSettings(raw: Record<string, unknown>): SourcesSection {
    const rawSources = (raw.sources as SourceConfig[]) ?? []

    const sources = rawSources
        .map((sourceConfig: SourceConfig) => {
            assert(sourceConfig, 'Source configuration is required')
            assert(sourceConfig.name, 'Source name is required')
            if (readBoolean(sourceConfig, 'forceAggregation', false) && !sourceConfig.aggregationMode) {
                sourceConfig.aggregationMode = 'before'
            }
            const rawTimeout = sourceConfig.aggregationTimeout ?? runtimeDefaults.source.aggregationTimeoutMinutes
            const aggregationTimeout =
                typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout >= 0
                    ? rawTimeout
                    : runtimeDefaults.source.aggregationTimeoutMinutes
            return {
                ...sourceConfig,
                enabled: extractBoolean(sourceConfig, 'enabled') ?? runtimeDefaults.source.enabled,
                aggregationMode: sourceConfig.aggregationMode ?? runtimeDefaults.source.aggregationMode,
                aggregationTimeout,
                aggregationDelay: sourceConfig.aggregationDelay ?? runtimeDefaults.source.aggregationDelay,
                optimizedAggregation:
                    extractBoolean(sourceConfig, 'optimizedAggregation') ?? runtimeDefaults.source.optimizedAggregation,
                accountFilter: sourceConfig.accountFilter ?? undefined,
                accountJmespathFilter: sourceConfig.accountJmespathFilter ?? undefined,
                correlationMode: sourceConfig.correlationMode ?? runtimeDefaults.source.correlationMode,
                deferredMatching: extractBoolean(sourceConfig, 'deferredMatching') ?? runtimeDefaults.source.deferredMatching,
                includeRecordAccountsForMatching:
                    extractBoolean(sourceConfig, 'includeRecordAccountsForMatching') ?? runtimeDefaults.source.includeRecordAccountsForMatching,
                disableNonMatchingAccounts:
                    extractBoolean(sourceConfig, 'disableNonMatchingAccounts') ?? runtimeDefaults.source.disableNonMatchingAccounts,
            }
        })
        .filter((sourceConfig: SourceConfig) => sourceConfig.enabled)

    softAssert(sources.length > 0, 'No sources configured - no Match will be performed', 'warn')

    return { sources }
}