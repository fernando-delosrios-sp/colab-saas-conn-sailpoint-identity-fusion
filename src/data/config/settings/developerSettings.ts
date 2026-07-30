/**
 * connector-spec.json -> Advanced Settings -> Developer Settings
 */
import { bootstrapLog } from '../../../services/logService'
import { extractBoolean } from '../../../utils/attributes'
import type { DeveloperSettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    managedAccountsBatchSize: 100,
    scoringMaxConcurrency: 12,
} as const

export const runtimeDefaults = {
    managedAccountsBatchSize: connectorSpecInitialValues.managedAccountsBatchSize,
    scoringMaxConcurrency: connectorSpecInitialValues.scoringMaxConcurrency,
    resetAccounts: false,
    resetForms: false,
    concurrencyCheckEnabled: true,
    forceAttributeRefresh: false,
} as const

export function readSettings(raw: Record<string, unknown>): DeveloperSettingsSection {
    bootstrapLog.detail({ validation: 'success' })

    return {
        resetAccounts:
            extractBoolean(raw, 'resetAccounts') ??
            extractBoolean(raw, 'reset') ??
            runtimeDefaults.resetAccounts,
        resetForms: extractBoolean(raw, 'resetForms') ?? runtimeDefaults.resetForms,
        managedAccountsBatchSize: (raw.managedAccountsBatchSize as number | undefined) ?? runtimeDefaults.managedAccountsBatchSize,
        scoringMaxConcurrency: (raw.scoringMaxConcurrency as number | undefined) ?? runtimeDefaults.scoringMaxConcurrency,
        concurrencyCheckEnabled: extractBoolean(raw, 'concurrencyCheckEnabled') ?? runtimeDefaults.concurrencyCheckEnabled,
        forceAttributeRefresh: extractBoolean(raw, 'forceAttributeRefresh') ?? runtimeDefaults.forceAttributeRefresh,
    }
}
