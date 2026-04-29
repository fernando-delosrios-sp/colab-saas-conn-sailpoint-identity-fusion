/**
 * connector-spec.json -> Attribute Matching Settings -> Review Settings
 */
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    fusionFormExpirationDays: 7,
    fusionMaxCandidatesForForm: 3,
} as const

export const runtimeDefaults = {} as const

export function defaultFusionMaxCandidatesForForm(): number {
    return connectorSpecInitialValues.fusionMaxCandidatesForForm
}

export function applySettings(config: FusionConfigBuild): void {
    config.fusionFormAttributes = config.fusionFormAttributes ?? []
    config.fusionFormExpirationDays =
        config.fusionFormExpirationDays ?? connectorSpecInitialValues.fusionFormExpirationDays
}
