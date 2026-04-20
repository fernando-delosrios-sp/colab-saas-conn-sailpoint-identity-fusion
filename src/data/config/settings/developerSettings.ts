/**
 * connector-spec.json -> Advanced Settings -> Developer Settings
 */
import { logger } from '@sailpoint/connector-sdk'
import { assert } from '../../../utils/assert'
import { internalConfig } from '../internal'
import { connectorSpecInitialValues as advancedInitialValues } from './advancedConnectionSettings'
import { defaultFusionMaxCandidatesForForm } from './reviewSettings'
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    externalLoggingLevel: 'info' as const,
} as const

export const runtimeDefaults = {
    forceAttributeRefresh: false,
    reset: false,
    externalLoggingEnabled: false,
    concurrencyCheckEnabled: true,
} as const

export function applySettings(config: FusionConfigBuild): void {
    config.reset = config.reset ?? runtimeDefaults.reset
    config.managedAccountsBatchSize =
        config.managedAccountsBatchSize ?? advancedInitialValues.managedAccountsBatchSize
    const rawMaxCandidates =
        config.fusionMaxCandidatesForForm !== undefined
            ? Number(config.fusionMaxCandidatesForForm)
            : defaultFusionMaxCandidatesForForm()
    assert(
        Number.isFinite(rawMaxCandidates) &&
            rawMaxCandidates >= internalConfig.formService.fusionMaxCandidatesForFormMin &&
            rawMaxCandidates <= internalConfig.formService.fusionMaxCandidatesForFormMax,
        `fusionMaxCandidatesForForm must be between ${internalConfig.formService.fusionMaxCandidatesForFormMin} and ${internalConfig.formService.fusionMaxCandidatesForFormMax}`
    )
    config.fusionMaxCandidatesForForm = Math.trunc(rawMaxCandidates)
    config.concurrencyCheckEnabled = config.concurrencyCheckEnabled ?? runtimeDefaults.concurrencyCheckEnabled
    config.forceAttributeRefresh = config.forceAttributeRefresh ?? runtimeDefaults.forceAttributeRefresh
    config.provisioningTimeout = config.provisioningTimeout ?? advancedInitialValues.provisioningTimeout
    config.externalLoggingEnabled = config.externalLoggingEnabled ?? runtimeDefaults.externalLoggingEnabled
    config.externalLoggingUrl = config.externalLoggingUrl ?? undefined
    config.externalLoggingLevel = config.externalLoggingLevel ?? connectorSpecInitialValues.externalLoggingLevel

    if (config.externalLoggingEnabled) {
        assert(config.externalLoggingUrl, 'External logging URL is required when external logging is enabled')
        assert(
            ['error', 'warn', 'info', 'debug'].includes(config.externalLoggingLevel || ''),
            'External logging level must be one of: error, warn, info, debug'
        )
    }

    logger.info('Configuration validation completed successfully')
}
