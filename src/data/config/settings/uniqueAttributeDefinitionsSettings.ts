/**
 * connector-spec.json -> Attribute Definition Settings -> Unique Attribute Definitions
 */
import type { UniqueAttributeDefinitionSettingsSection, UniqueAttributeDefinition } from '../../../model/config'

export const connectorSpecInitialValues = {
    maxAttempts: 20,
    digits: 1,
    counterStart: 1,
    case: 'same' as const,
    expression: '#set($initial = $firstname.substring(0, 1))$initial$lastname',
    useIncrementalCounter: false,
} as const

export function readSettings(raw: Record<string, unknown>): UniqueAttributeDefinitionSettingsSection {
    return {
        uniqueAttributeDefinitions: (raw.uniqueAttributeDefinitions as UniqueAttributeDefinition[]) ?? [],
        maxAttempts: (raw.maxAttempts as number | undefined) ?? connectorSpecInitialValues.maxAttempts,
    }
}
