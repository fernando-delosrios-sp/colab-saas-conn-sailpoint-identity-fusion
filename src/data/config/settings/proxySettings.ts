/**
 * connector-spec.json -> Advanced Settings -> Proxy Settings
 */
import type { ProxySettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    proxyEnabled: false,
    proxyUrl: '',
    proxyPassword: '',
} as const

export const runtimeDefaults = {} as const

export function readSettings(raw: Record<string, unknown>): ProxySettingsSection {
    return {
        proxyEnabled: (raw.proxyEnabled as boolean | undefined) ?? connectorSpecInitialValues.proxyEnabled,
        proxyUrl: (raw.proxyUrl as string | undefined) ?? connectorSpecInitialValues.proxyUrl,
        proxyPassword: (raw.proxyPassword as string | undefined) ?? connectorSpecInitialValues.proxyPassword,
        proxyRequestTimeoutMs: raw.proxyRequestTimeoutMs as number | undefined,
    }
}
