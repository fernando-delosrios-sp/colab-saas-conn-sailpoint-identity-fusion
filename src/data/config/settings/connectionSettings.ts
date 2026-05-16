/**
 * connector-spec.json -> Connection Settings (menu) / Connection Settings (section).
 * No `sourceConfigInitialValues` keys; connection fields are required from the platform.
 */
import { assert } from '../../../utils/assert'
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {} as const
export const runtimeDefaults = {} as const

export function applySettings(config: FusionConfigBuild): void {
    assert(config.baseurl, 'Base URL is required in configuration')
    assert(
        config.baseurl.toLowerCase().startsWith('http://') || config.baseurl.toLowerCase().startsWith('https://'),
        'Base URL must use http or https protocol'
    )
    assert(config.clientId, 'Client ID is required in configuration')
    assert(config.clientSecret, 'Client secret is required in configuration')
    assert(config.spConnectorInstanceId, 'Connector instance ID is required in configuration')
}
