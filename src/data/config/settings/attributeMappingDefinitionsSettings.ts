/**
 * connector-spec.json -> Attribute Mapping Settings -> Attribute Mapping Definitions
 */
import type { FusionConfigBuild } from '../types'
import { AttributeMergeMode } from '../../../model/config'

export const connectorSpecInitialValues = {
    attributeMerge: AttributeMergeMode.First,
} as const

export const runtimeDefaults = {} as const

export function applySettings(config: FusionConfigBuild): void {
    config.attributeMaps = config.attributeMaps ?? []
}
