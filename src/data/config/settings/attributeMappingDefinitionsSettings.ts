/**
 * connector-spec.json -> Attribute Mapping Settings -> Attribute Mapping Definitions
 */
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    attributeMerge: 'first' as const,
} as const

export const runtimeDefaults = {} as const

export function applySettings(config: FusionConfigBuild): void {
    config.attributeMaps = config.attributeMaps ?? []
}
