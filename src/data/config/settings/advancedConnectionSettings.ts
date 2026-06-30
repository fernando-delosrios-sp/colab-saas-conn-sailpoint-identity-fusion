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
    parallelBatchSize: 8,
} as const

export function readSettings(raw: Record<string, unknown>): AdvancedConnectionSettingsSection {
    const processingWaitSeconds =
        raw.processingWait !== undefined
            ? (raw.processingWait as number)
            : internalConfig.clientService.processingWaitConstant / 1000

    return {
        maxRetries: (raw.maxRetries as number | undefined) ?? internalConfig.clientService.retriesConstant,
        requestsPerSecond: (raw.requestsPerSecond as number | undefined) ?? connectorSpecInitialValues.requestsPerSecond,
        maxConcurrentRequests: (raw.maxConcurrentRequests as number | undefined) ?? connectorSpecInitialValues.maxConcurrentRequests,
        parallelBatchSize: (raw.parallelBatchSize as number | undefined) ?? runtimeDefaults.parallelBatchSize,
        batchSize: (raw.batchSize as number | undefined) ?? internalConfig.clientService.pageSize,
        enablePriority: extractBoolean(raw, 'enablePriority') ?? matchingInitialValues.enablePriority,
        processingWait: processingWaitSeconds * 1000,
        provisioningTimeout: (raw.provisioningTimeout as number | undefined) ?? connectorSpecInitialValues.provisioningTimeout,
    }
}