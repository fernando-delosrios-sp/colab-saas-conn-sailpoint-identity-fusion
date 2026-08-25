/**
 * connector-spec.json -> Advanced Settings -> Advanced Connection Settings
 */
import { extractBoolean } from '../../../utils/attributes'
import { internalConfig } from '../internal'
import { connectorSpecInitialValues as matchingInitialValues } from './matchingSettings'
import type { AdvancedConnectionSettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    provisioningTimeout: 300,
    maxRetries: 20,
    requestsPerSecond: 10,
    maxConcurrentRequests: 20,
    parallelBatchSize: 16,
    processingWait: 180,
    heartbeatInterval: 10,
} as const

export const runtimeDefaults = {
    maxRetries: internalConfig.clientService.retriesConstant,
    requestsPerSecond: connectorSpecInitialValues.requestsPerSecond,
    maxConcurrentRequests: connectorSpecInitialValues.maxConcurrentRequests,
    parallelBatchSize: connectorSpecInitialValues.parallelBatchSize,
    enablePriority: matchingInitialValues.enablePriority,
    processingWait: internalConfig.clientService.processingWaitConstant,
    provisioningTimeout: connectorSpecInitialValues.provisioningTimeout,
    statsLoggingIntervalMs: connectorSpecInitialValues.heartbeatInterval * 1000,
} as const

export type AdvancedConnectionSettingsReadResult = AdvancedConnectionSettingsSection & {
    statsLoggingIntervalMs: number
}

export function readSettings(raw: Record<string, unknown>): AdvancedConnectionSettingsReadResult {
    const requestedProcessingWaitMs =
        raw.processingWait !== undefined
            ? (raw.processingWait as number) * 1000
            : runtimeDefaults.processingWait
    // ISC keep-alive cannot exceed 180s; default equals that cap.
    const processingWaitMs = Math.min(requestedProcessingWaitMs, runtimeDefaults.processingWait)

    const statsLoggingIntervalMs =
        raw.heartbeatInterval !== undefined
            ? (raw.heartbeatInterval as number) * 1000
            : runtimeDefaults.statsLoggingIntervalMs

    return {
        maxRetries: (raw.maxRetries as number | undefined) ?? runtimeDefaults.maxRetries,
        requestsPerSecond: (raw.requestsPerSecond as number | undefined) ?? runtimeDefaults.requestsPerSecond,
        maxConcurrentRequests: (raw.maxConcurrentRequests as number | undefined) ?? runtimeDefaults.maxConcurrentRequests,
        parallelBatchSize: (raw.parallelBatchSize as number | undefined) ?? runtimeDefaults.parallelBatchSize,
        enablePriority: extractBoolean(raw, 'enablePriority') ?? runtimeDefaults.enablePriority,
        processingWait: processingWaitMs,
        provisioningTimeout: (raw.provisioningTimeout as number | undefined) ?? runtimeDefaults.provisioningTimeout,
        statsLoggingIntervalMs,
    }
}

