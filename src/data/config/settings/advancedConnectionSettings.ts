/**
 * connector-spec.json -> Advanced Settings -> Advanced Connection Settings
 */
import { extractBoolean } from '../../../utils/attributes'
import { internalConfig } from '../internal'
import { connectorSpecInitialValues as matchingInitialValues } from './matchingSettings'
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    provisioningTimeout: 300,
    managedAccountsBatchSize: 100,
    enableQueue: true,
    enableRetry: true,
    maxRetries: 20,
    requestsPerSecond: 10,
    maxConcurrentRequests: 10,
    processingWait: 60,
    retryDelay: 1000,
    batchSize: 250,
} as const

export const runtimeDefaults = {
    parallelBatchSize: 8,
} as const

export function applySettings(config: FusionConfigBuild): void {
    config.enableQueue = extractBoolean(config, 'enableQueue') ?? connectorSpecInitialValues.enableQueue
    config.enableRetry = extractBoolean(config, 'enableRetry') ?? connectorSpecInitialValues.enableRetry
    config.maxRetries = config.maxRetries ?? internalConfig.clientService.retriesConstant
    config.requestsPerSecond = config.requestsPerSecond ?? connectorSpecInitialValues.requestsPerSecond
    config.maxConcurrentRequests = config.maxConcurrentRequests ?? connectorSpecInitialValues.maxConcurrentRequests
    config.retryDelay = config.retryDelay ?? connectorSpecInitialValues.retryDelay
    config.parallelBatchSize = config.parallelBatchSize ?? runtimeDefaults.parallelBatchSize
    config.pageSize = config.batchSize ?? internalConfig.clientService.pageSize
    config.enablePriority = extractBoolean(config, 'enablePriority') ?? matchingInitialValues.enablePriority
    const processingWaitSeconds =
        config.processingWait !== undefined ? config.processingWait : internalConfig.clientService.processingWaitConstant / 1000
    config.processingWait = processingWaitSeconds * 1000
}