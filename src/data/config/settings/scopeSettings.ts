/**
 * connector-spec.json -> Source Settings -> Scope
 */
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    includeIdentities: true,
    identityScopeQuery: '*',
} as const

export const runtimeDefaults = {} as const

export function applySettings(_config: FusionConfigBuild): void {
    // Scope fields use platform / `connectorSpecInitialValues` only; no extra normalization.
}
