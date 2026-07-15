/**
 * connector-spec.json -> Advanced Settings -> Developer Settings
 */
import { logger } from '@sailpoint/connector-sdk'
import { assert } from './assertLite'
import { extractBoolean } from '../../../utils/attributes'
import type { DeveloperSettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    externalLoggingLevel: 'info' as const,
    managedAccountsBatchSize: 100,
} as const

export const runtimeDefaults = {
    externalLoggingLevel: connectorSpecInitialValues.externalLoggingLevel,
    managedAccountsBatchSize: connectorSpecInitialValues.managedAccountsBatchSize,
    reset: false,
    externalLoggingEnabled: false,
    concurrencyCheckEnabled: true,
    forceAttributeRefresh: false,
} as const

export function readSettings(raw: Record<string, unknown>): DeveloperSettingsSection {
    const externalLoggingEnabled = extractBoolean(raw, 'externalLoggingEnabled') ?? runtimeDefaults.externalLoggingEnabled
    const externalLoggingUrl = raw.externalLoggingUrl as string | undefined
    const externalLoggingLevel = (raw.externalLoggingLevel as 'error' | 'warn' | 'info' | 'debug' | undefined) ?? runtimeDefaults.externalLoggingLevel

    if (externalLoggingEnabled) {
        assert(externalLoggingUrl, 'External logging URL is required when external logging is enabled')
        assert(
            externalLoggingUrl.toLowerCase().startsWith('http://') ||
                externalLoggingUrl.toLowerCase().startsWith('https://'),
            'External logging URL must use http or https protocol'
        )
        assert(
            ['error', 'warn', 'info', 'debug'].includes(externalLoggingLevel || ''),
            'External logging level must be one of: error, warn, info, debug'
        )
    }

    logger.info('Configuration validation completed successfully')

    return {
        reset: extractBoolean(raw, 'reset') ?? runtimeDefaults.reset,
        managedAccountsBatchSize: (raw.managedAccountsBatchSize as number | undefined) ?? runtimeDefaults.managedAccountsBatchSize,
        concurrencyCheckEnabled: extractBoolean(raw, 'concurrencyCheckEnabled') ?? runtimeDefaults.concurrencyCheckEnabled,
        forceAttributeRefresh: extractBoolean(raw, 'forceAttributeRefresh') ?? runtimeDefaults.forceAttributeRefresh,
        externalLoggingEnabled,
        externalLoggingUrl,
        externalLoggingLevel,
    }
}