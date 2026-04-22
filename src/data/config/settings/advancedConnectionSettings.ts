/**
 * connector-spec.json -> Advanced Settings -> Advanced Connection Settings
 */
import { internalConfig } from '../internal'
import type { FusionConfigBuild } from '../types'

export const connectorSpecInitialValues = {
    provisioningTimeout: 300,
    objectMaxConcurrent: 50,
    apiMaxConcurrent: 10,
    processingWait: 60,
} as const

export const runtimeDefaults = {} as const

export function applySettings(config: FusionConfigBuild): void {
    config.apiMaxConcurrent = config.apiMaxConcurrent ?? connectorSpecInitialValues.apiMaxConcurrent
    config.objectMaxConcurrent = config.objectMaxConcurrent ?? connectorSpecInitialValues.objectMaxConcurrent
    const processingWaitSeconds =
        config.processingWait !== undefined ? config.processingWait : internalConfig.clientService.processingWaitConstant / 1000
    config.processingWait = processingWaitSeconds * 1000
    config.pageSize = internalConfig.clientService.pageSize
}
