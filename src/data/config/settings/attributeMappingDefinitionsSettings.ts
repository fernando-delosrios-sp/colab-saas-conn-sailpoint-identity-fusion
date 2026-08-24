/**
 * connector-spec.json -> Attribute Mapping Settings -> Attribute Mapping Definitions
 */
import {
    AttributeMergeMode,
    type AttributeMappingDefinitionsSection,
    type AttributeMap,
    type DefaultAttributeMergeMode,
} from '../../../model/config'

export const connectorSpecInitialValues = {
    attributeMerge: AttributeMergeMode.MainAccount,
} as const

export const runtimeDefaults = {
    attributeMerge: connectorSpecInitialValues.attributeMerge,
} as const

const defaultAttributeMergeModes = new Set<unknown>([
    AttributeMergeMode.MainAccount,
    AttributeMergeMode.OriginAccount,
    AttributeMergeMode.First,
    AttributeMergeMode.List,
    AttributeMergeMode.Concatenate,
])

export function readSettings(raw: Record<string, unknown>): AttributeMappingDefinitionsSection {
    const rawAttributeMerge = raw.attributeMerge
    const attributeMerge =
        rawAttributeMerge === undefined
            ? runtimeDefaults.attributeMerge
            : defaultAttributeMergeModes.has(rawAttributeMerge)
              ? (rawAttributeMerge as DefaultAttributeMergeMode)
              : AttributeMergeMode.First

    return {
        attributeMerge,
        attributeMaps: (raw.attributeMaps as AttributeMap[]) ?? [],
    }
}
