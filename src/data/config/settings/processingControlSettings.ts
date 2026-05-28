/**
 * connector-spec.json -> Source Settings -> Processing Control
 */
import { extractBoolean } from '../../../utils/attributes'
import type { ProcessingControlSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    maxHistoryMessages: 10,
} as const

export const runtimeDefaults = {
    deleteEmpty: false,
    skipAccountsWithMissingId: false,
} as const

export function readSettings(raw: Record<string, unknown>): ProcessingControlSection {
    return {
        deleteEmpty: extractBoolean(raw, 'deleteEmpty') ?? runtimeDefaults.deleteEmpty,
        skipAccountsWithMissingId: extractBoolean(raw, 'skipAccountsWithMissingId') ?? runtimeDefaults.skipAccountsWithMissingId,
        maxHistoryMessages: (raw.maxHistoryMessages as number | undefined) ?? connectorSpecInitialValues.maxHistoryMessages,
        cascadeAggregationEnabled: raw.cascadeAggregationEnabled as boolean | undefined,
    }
}
