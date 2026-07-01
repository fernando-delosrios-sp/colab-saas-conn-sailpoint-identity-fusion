/**
 * connector-spec.json -> Connection Settings (menu) / Connection Settings (section).
 * No `sourceConfigInitialValues` keys; connection fields are required from the platform.
 */
import { assert } from '../../../utils/assert'
import { isValidHttpUrl } from '../../../utils/url'

export const connectorSpecInitialValues = {} as const
export const runtimeDefaults = {} as const

export function readSettings(raw: Record<string, unknown>): Record<string, never> {
    const baseurl = raw.baseurl as string | undefined
    assert(baseurl, 'Base URL is required in configuration')
    assert(
        // 🛡️ Sentinel: Enforce strict URL parsing to prevent SSRF bypasses via malformed schemes like http:file://
        isValidHttpUrl(baseurl),
        'Base URL must use http or https protocol'
    )
    assert(raw.clientId, 'Client ID is required in configuration')
    assert(raw.clientSecret, 'Client secret is required in configuration')
    assert(raw.spConnectorInstanceId, 'Connector instance ID is required in configuration')

    return {}
}
