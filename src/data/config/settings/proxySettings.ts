/**
 * connector-spec.json -> Advanced Settings -> Proxy Settings
 */
import type { ProxySettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    proxyEnabled: false,
    proxyUrl: '',
    proxyPassword: '',
} as const

export const runtimeDefaults = {
    proxyEnabled: connectorSpecInitialValues.proxyEnabled,
    proxyUrl: connectorSpecInitialValues.proxyUrl,
    proxyPassword: connectorSpecInitialValues.proxyPassword,
} as const

export function readSettings(raw: Record<string, unknown>): ProxySettingsSection {
    return {
        proxyEnabled: (raw.proxyEnabled as boolean | undefined) ?? runtimeDefaults.proxyEnabled,
        proxyUrl: (raw.proxyUrl as string | undefined) ?? runtimeDefaults.proxyUrl,
        proxyPassword: (raw.proxyPassword as string | undefined) ?? runtimeDefaults.proxyPassword,
        proxyRequestTimeoutMs: raw.proxyRequestTimeoutMs as number | undefined,
    }
}
