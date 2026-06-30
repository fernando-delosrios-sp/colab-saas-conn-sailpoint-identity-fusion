/**
 * connector-spec.json -> Source Settings -> Scope
 */
import type { ScopeSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    includeIdentities: true,
    identityScopeQuery: '*',
} as const

export const runtimeDefaults = {
    includeIdentities: connectorSpecInitialValues.includeIdentities,
    identityScopeQuery: connectorSpecInitialValues.identityScopeQuery,
} as const

export function readSettings(raw: Record<string, unknown>): ScopeSection {
    return {
        includeIdentities: (raw.includeIdentities as boolean | undefined) ?? runtimeDefaults.includeIdentities,
        identityScopeQuery: (raw.identityScopeQuery as string | undefined) ?? runtimeDefaults.identityScopeQuery,
    }
}
