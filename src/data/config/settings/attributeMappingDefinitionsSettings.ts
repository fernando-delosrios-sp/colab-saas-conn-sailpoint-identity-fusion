/**
 * connector-spec.json -> Attribute Mapping Settings -> Attribute Mapping Definitions
 */
import { AttributeMergeMode, type AttributeMappingDefinitionsSection, type AttributeMap, type DefaultAttributeMergeMode } from '../../../model/config'

export const connectorSpecInitialValues = {
    attributeMerge: AttributeMergeMode.First,
} as const

export function readSettings(raw: Record<string, unknown>): AttributeMappingDefinitionsSection {
    return {
        attributeMerge: (raw.attributeMerge as DefaultAttributeMergeMode) ?? connectorSpecInitialValues.attributeMerge,
        attributeMaps: (raw.attributeMaps as AttributeMap[]) ?? [],
    }
}
