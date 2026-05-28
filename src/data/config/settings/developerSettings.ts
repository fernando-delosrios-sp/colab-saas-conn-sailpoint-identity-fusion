/**
 * connector-spec.json -> Advanced Settings -> Developer Settings
 */
import { logger } from '@sailpoint/connector-sdk'
import { assert } from '../../../utils/assert'
import { extractBoolean } from '../../../utils/attributes'
import { internalConfig } from '../internal'
import { connectorSpecInitialValues as advancedInitialValues } from './advancedConnectionSettings'
import { defaultFusionMaxCandidatesForForm } from './reviewSettings'
import type { DeveloperSettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    externalLoggingLevel: 'info' as const,
} as const

export const runtimeDefaults = {
    forceAttributeRefresh: false,
    reset: false,
    externalLoggingEnabled: false,
    concurrencyCheckEnabled: true,
} as const

export function readSettings(raw: Record<string, unknown>): DeveloperSettingsSection {
    const externalLoggingEnabled = extractBoolean(raw, 'externalLoggingEnabled') ?? runtimeDefaults.externalLoggingEnabled
    const externalLoggingUrl = raw.externalLoggingUrl as string | undefined
    const externalLoggingLevel = (raw.externalLoggingLevel as 'error' | 'warn' | 'info' | 'debug' | undefined) ?? connectorSpecInitialValues.externalLoggingLevel

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

    const rawMaxCandidates =
        raw.fusionMaxCandidatesForForm !== undefined
            ? Number(raw.fusionMaxCandidatesForForm)
            : defaultFusionMaxCandidatesForForm()
    assert(
        Number.isFinite(rawMaxCandidates) &&
            rawMaxCandidates >= internalConfig.formService.fusionMaxCandidatesForFormMin &&
            rawMaxCandidates <= internalConfig.formService.fusionMaxCandidatesForFormMax,
        `fusionMaxCandidatesForForm must be between ${internalConfig.formService.fusionMaxCandidatesForFormMin} and ${internalConfig.formService.fusionMaxCandidatesForFormMax}`
    )

    logger.info('Configuration validation completed successfully')

    return {
        reset: extractBoolean(raw, 'reset') ?? runtimeDefaults.reset,
        managedAccountsBatchSize: (raw.managedAccountsBatchSize as number | undefined) ?? advancedInitialValues.managedAccountsBatchSize,
        fusionMaxCandidatesForForm: Math.trunc(rawMaxCandidates),
        concurrencyCheckEnabled: extractBoolean(raw, 'concurrencyCheckEnabled') ?? runtimeDefaults.concurrencyCheckEnabled,
        forceAttributeRefresh: extractBoolean(raw, 'forceAttributeRefresh') ?? runtimeDefaults.forceAttributeRefresh,
        externalLoggingEnabled,
        externalLoggingUrl,
        externalLoggingLevel,
    }
}