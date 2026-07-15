/**
 * connector-spec.json -> Attribute Definition Settings -> Normal Attribute Definitions
 */
import type { NormalAttributeDefinitionSettingsSection, NormalAttributeDefinition } from '../../../model/config'

export const connectorSpecInitialValues = {
    refresh: false,
    static: false,
    trim: false,
} as const

export function readSettings(raw: Record<string, unknown>): NormalAttributeDefinitionSettingsSection {
    return {
        normalAttributeDefinitions: (raw.normalAttributeDefinitions as NormalAttributeDefinition[]) ?? [],
    }
}
