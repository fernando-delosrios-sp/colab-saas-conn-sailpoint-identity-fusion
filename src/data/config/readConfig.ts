import { readConfig } from '@sailpoint/connector-sdk'
import type { FusionConfig, RecordingConfig } from '../../model/config'
import { bootstrapLog } from '../../services/logService'
import { getInternalConfigFlat } from './internal'
import * as advancedConnectionSettings from './settings/advancedConnectionSettings'
import * as attributeMappingDefinitionsSettings from './settings/attributeMappingDefinitionsSettings'
import * as connectionSettings from './settings/connectionSettings'
import * as developerSettings from './settings/developerSettings'
import * as externalSettings from './settings/externalSettings'
import * as matchingSettings from './settings/matchingSettings'
import * as normalAttributeDefinitionsSettings from './settings/normalAttributeDefinitionsSettings'
import * as processingControlSettings from './settings/processingControlSettings'
import * as reviewSettings from './settings/reviewSettings'
import * as scopeSettings from './settings/scopeSettings'
import * as sourcesSettings from './settings/sourcesSettings'
import * as uniqueAttributeDefinitionsSettings from './settings/uniqueAttributeDefinitionsSettings'
import { resolveRecordingConfig } from './resolveRecordingConfig'
import { assertForwardedProxyAuthorized, isProxyServerExecutionHost } from '../../utils/proxyRole'

const settingsPipeline = [
    sourcesSettings.readSettings,
    processingControlSettings.readSettings,
    scopeSettings.readSettings,
    attributeMappingDefinitionsSettings.readSettings,
    normalAttributeDefinitionsSettings.readSettings,
    uniqueAttributeDefinitionsSettings.readSettings,
    matchingSettings.readSettings,
    reviewSettings.readSettings,
    developerSettings.readSettings,
    advancedConnectionSettings.readSettings,
    externalSettings.readSettings,
] as const

/**
 * Bridges ISC External Settings recording name into RecordingConfig before env resolution.
 * Platform explicit `recording.mode` and env vars retain precedence via resolveRecordingConfig.
 */
function bridgeExternalRecording(config: FusionConfig, rawRecording?: Partial<RecordingConfig>): Partial<RecordingConfig> | undefined {
    const gatewayActive = config.externalProcessingEnabled === true
    const proxyActive = config.externalProxyEnabled === true
    const recordingActive = config.externalRecordingEnabled === true
    const chainName = config.recordingName

    if (!gatewayActive || !proxyActive || !recordingActive || !chainName) {
        return rawRecording
    }

    // Chain artifacts are written on the proxy server only — not on the ISC forwarding client.
    if (!isProxyServerExecutionHost(config)) {
        return rawRecording
    }

    const bridged: Partial<RecordingConfig> = { ...rawRecording }

    // ISC proxy clients resolve recording.mode to 'off' before forwarding; the server must still record.
    const clientResolvedOff = config.isProxy === true && bridged.mode === 'off'
    if (bridged.mode === undefined || clientResolvedOff) {
        bridged.mode = 'record'
    }
    if (bridged.scenarioName === undefined && bridged.chainName === undefined) {
        bridged.scenarioName = chainName
        bridged.chainName = chainName
    }

    return bridged
}

/**
 * Normalizes platform `readConfig()` into `FusionConfig`: merges flattened internal constants
 * (`getInternalConfigFlat()`, from per-service `internalConfig`), then applies per-settings modules.
 */
export const safeReadConfig = async (): Promise<FusionConfig> => {
    bootstrapLog.debug('Reading connector configuration')
    const sourceConfig = await readConfig()
    if (!sourceConfig) {
        throw new Error('Failed to read source configuration')
    }

    const rawConfig = {
        ...sourceConfig,
        ...getInternalConfigFlat(),
    }

    const connectionFragment = connectionSettings.readSettings(rawConfig)

    bootstrapLog.debug('Configuration loaded, applying defaults')

    const fragments = settingsPipeline.map((read) => read(rawConfig))

    const config = Object.assign({}, rawConfig, connectionFragment, ...fragments) as FusionConfig

    assertForwardedProxyAuthorized(config)

    const rawRecording = (sourceConfig as { recording?: Partial<RecordingConfig> }).recording
    config.recording = resolveRecordingConfig(bridgeExternalRecording(config, rawRecording))

    return config
}


