/**
 * connector-spec.json -> Advanced Settings -> External Settings
 */
import { bootstrapLog } from '../../../services/logService'
import { extractBoolean } from '../../../utils/attributes'
import type { ExternalSettingsSection } from '../../../model/config'
import { assert } from './assertLite'

export const connectorSpecInitialValues = {
    externalProcessingEnabled: false,
    externalTargetUrl: '',
    externalTargetPassword: '',
    externalProxyEnabled: false,
    externalRecordingEnabled: false,
    recordingName: '',
    externalLoggingEnabled: false,
    externalLoggingLevel: 'info' as const,
} as const

export const runtimeDefaults = {
    externalProcessingEnabled: connectorSpecInitialValues.externalProcessingEnabled,
    externalTargetUrl: connectorSpecInitialValues.externalTargetUrl,
    externalTargetPassword: connectorSpecInitialValues.externalTargetPassword,
    externalProxyEnabled: connectorSpecInitialValues.externalProxyEnabled,
    externalRecordingEnabled: connectorSpecInitialValues.externalRecordingEnabled,
    recordingName: connectorSpecInitialValues.recordingName,
    externalLoggingEnabled: connectorSpecInitialValues.externalLoggingEnabled,
    externalLoggingLevel: connectorSpecInitialValues.externalLoggingLevel,
} as const

function assertHttpOrHttpsUrl(url: string, label: string): void {
    assert(
        url.toLowerCase().startsWith('http://') || url.toLowerCase().startsWith('https://'),
        `${label} must use http or https protocol`
    )
}

export function readSettings(raw: Record<string, unknown>): ExternalSettingsSection {
    const externalProcessingEnabled =
        extractBoolean(raw, 'externalProcessingEnabled') ?? runtimeDefaults.externalProcessingEnabled
    const externalProxyEnabled =
        extractBoolean(raw, 'externalProxyEnabled') ?? runtimeDefaults.externalProxyEnabled
    const externalRecordingEnabled =
        extractBoolean(raw, 'externalRecordingEnabled') ?? runtimeDefaults.externalRecordingEnabled
    const externalLoggingEnabled =
        extractBoolean(raw, 'externalLoggingEnabled') ?? runtimeDefaults.externalLoggingEnabled

    const externalTargetUrl = (raw.externalTargetUrl as string | undefined) ?? runtimeDefaults.externalTargetUrl
    const externalTargetPassword =
        (raw.externalTargetPassword as string | undefined) ?? runtimeDefaults.externalTargetPassword
    const recordingName = (raw.recordingName as string | undefined) ?? runtimeDefaults.recordingName
    const externalLoggingLevel =
        (raw.externalLoggingLevel as 'error' | 'warn' | 'info' | 'debug' | undefined) ??
        runtimeDefaults.externalLoggingLevel

    if (externalProcessingEnabled) {
        const needsUrl =
            externalProxyEnabled || (externalLoggingEnabled && !externalProxyEnabled)

        if (needsUrl) {
            assert(externalTargetUrl, 'External target URL is required when external processing sub-options need a target')
            assertHttpOrHttpsUrl(externalTargetUrl, 'External target URL')
        }

        if (externalProxyEnabled) {
            assert(externalTargetPassword, 'External target password is required when proxy mode is enabled')
        }

        if (externalRecordingEnabled) {
            assert(externalProxyEnabled, 'External recording requires proxy mode to be enabled')
            assert(recordingName, 'Recording name is required when external recording is enabled')
        }

        if (externalLoggingEnabled) {
            assert(
                ['error', 'warn', 'info', 'debug'].includes(externalLoggingLevel || ''),
                'External logging level must be one of: error, warn, info, debug'
            )
        }
    }

    bootstrapLog.detail({ validation: 'success' })

    return {
        externalProcessingEnabled,
        externalTargetUrl,
        externalTargetPassword,
        externalProxyEnabled,
        externalRecordingEnabled,
        recordingName,
        externalLoggingEnabled,
        externalLoggingLevel,
        proxyRequestTimeoutMs: raw.proxyRequestTimeoutMs as number | undefined,
    }
}
