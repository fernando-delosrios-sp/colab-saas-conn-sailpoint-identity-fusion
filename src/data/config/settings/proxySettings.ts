/**
 * connector-spec.json -> Advanced Settings -> Proxy Settings
 */
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    proxyEnabled: false,
    proxyUrl: '',
    proxyPassword: '',
} as const

export const runtimeDefaults = {} as const

export function applySettings(_config: FusionConfigBuild): void {
    // Proxy fields are read from the platform as-is; no additional normalization.
}
