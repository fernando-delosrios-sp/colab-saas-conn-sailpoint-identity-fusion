/**
 * connector-spec.json -> Advanced Settings -> Advanced Connection Settings
 */
import { extractBoolean } from '../../../utils/attributes'
import { internalConfig } from '../internal'
import { connectorSpecInitialValues as matchingInitialValues } from './matchingSettings'
import type { AdvancedConnectionSettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    provisioningTimeout: 300,
    managedAccountsBatchSize: 100,
    maxRetries: 20,
    requestsPerSecond: 10,
    maxConcurrentRequests: 10,
    processingWait: 60,
    batchSize: 250,
} as const

export const runtimeDefaults = {
    maxRetries: internalConfig.clientService.retriesConstant,
    requestsPerSecond: connectorSpecInitialValues.requestsPerSecond,
    maxConcurrentRequests: connectorSpecInitialValues.maxConcurrentRequests,
    parallelBatchSize: 8,
    batchSize: internalConfig.clientService.pageSize,
    enablePriority: matchingInitialValues.enablePriority,
    processingWait: internalConfig.clientService.processingWaitConstant,
    provisioningTimeout: connectorSpecInitialValues.provisioningTimeout,
} as const

export function readSettings(raw: Record<string, unknown>): AdvancedConnectionSettingsSection {
    const processingWaitMs =
        raw.processingWait !== undefined
            ? (raw.processingWait as number) * 1000
            : runtimeDefaults.processingWait

    return {
        maxRetries: (raw.maxRetries as number | undefined) ?? runtimeDefaults.maxRetries,
        requestsPerSecond: (raw.requestsPerSecond as number | undefined) ?? runtimeDefaults.requestsPerSecond,
        maxConcurrentRequests: (raw.maxConcurrentRequests as number | undefined) ?? runtimeDefaults.maxConcurrentRequests,
        parallelBatchSize: (raw.parallelBatchSize as number | undefined) ?? runtimeDefaults.parallelBatchSize,
        batchSize: (raw.batchSize as number | undefined) ?? runtimeDefaults.batchSize,
        enablePriority: extractBoolean(raw, 'enablePriority') ?? runtimeDefaults.enablePriority,
        processingWait: processingWaitMs,
        provisioningTimeout: (raw.provisioningTimeout as number | undefined) ?? runtimeDefaults.provisioningTimeout,
    }
}