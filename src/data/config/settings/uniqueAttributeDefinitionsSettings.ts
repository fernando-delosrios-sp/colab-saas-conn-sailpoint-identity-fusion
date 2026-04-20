/**
 * connector-spec.json -> Attribute Definition Settings -> Unique Attribute Definitions
 */
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    maxAttempts: 20,
    digits: 1,
    counterStart: 1,
    case: 'same' as const,
    expression: '#set($initial = $firstname.substring(0, 1))$initial$lastname',
    useIncrementalCounter: false,
} as const

export const runtimeDefaults = {
    trim: false,
} as const

export function applySettings(config: FusionConfigBuild): void {
    config.uniqueAttributeDefinitions = config.uniqueAttributeDefinitions ?? []
    config.trim = config.trim ?? runtimeDefaults.trim
    config.maxAttempts = config.maxAttempts ?? connectorSpecInitialValues.maxAttempts
}
