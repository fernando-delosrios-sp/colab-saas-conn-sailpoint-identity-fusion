/**
 * connector-spec.json -> Source Settings -> Scope
 */
import type { ScopeSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    includeIdentities: true,
    identityScopeQuery: '*',
} as const

const runtimeDefaults = {} as const

export function readSettings(raw: Record<string, unknown>): ScopeSection {
    return {
        includeIdentities: (raw.includeIdentities as boolean | undefined) ?? connectorSpecInitialValues.includeIdentities,
        identityScopeQuery: (raw.identityScopeQuery as string | undefined) ?? connectorSpecInitialValues.identityScopeQuery,
    }
}
