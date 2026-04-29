/**
 * connector-spec.json -> Attribute Definition Settings -> Normal Attribute Definitions
 */
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    refresh: false,
    trim: false,
    force: false,
} as const

export const runtimeDefaults = {} as const

export function applySettings(config: FusionConfigBuild): void {
    config.normalAttributeDefinitions = config.normalAttributeDefinitions ?? []
}
