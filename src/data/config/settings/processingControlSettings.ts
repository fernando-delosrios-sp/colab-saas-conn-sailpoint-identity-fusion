/**
 * connector-spec.json -> Source Settings -> Processing Control
 */
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    maxHistoryMessages: 10,
} as const

export const runtimeDefaults = {
    deleteEmpty: false,
    skipAccountsWithMissingId: false,
} as const

export function applySettings(config: FusionConfigBuild): void {
    config.deleteEmpty = config.deleteEmpty ?? runtimeDefaults.deleteEmpty
    config.skipAccountsWithMissingId =
        config.skipAccountsWithMissingId ?? runtimeDefaults.skipAccountsWithMissingId
    config.maxHistoryMessages =
        config.maxHistoryMessages ?? connectorSpecInitialValues.maxHistoryMessages
}
