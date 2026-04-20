import { internalConfigClientService } from './clientService'
import { internalConfigFormService } from './formService'
import { internalConfigFusionService } from './fusionService'
import { internalConfigMessagingService } from './messagingService'

/**
 * Internal constants grouped by owning service area (not in `connector-spec.json`).
 * Use `getInternalConfigFlat()` when merging onto `FusionConfig` (flat `InternalConfig` shape).
 */
export const internalConfig = {
    clientService: internalConfigClientService,
    messagingService: internalConfigMessagingService,
    fusionService: internalConfigFusionService,
    formService: internalConfigFormService,
} as const

export type InternalConfigByService = typeof internalConfig

/** Flattened for `readConfig` merge — matches `InternalConfig` on `FusionConfig`. */
export function getInternalConfigFlat(): {
    requestsPerSecondConstant: number
    pageSize: number
    tokenUrlPath: string
    processingWaitConstant: number
    retriesConstant: number
    maxRetryDelayMs: number
    retryJitterFactor: number
    rateLimitJitterFactor: number
    statsLoggingIntervalMs: number
    maxStatsSamples: number
    queueProcessingIntervalMs: number
    sailPointListMax: number
    workflowName: string
    delayedAggregationWorkflowName: string
    padding: string
    msDay: number
    identityNotFoundWait: number
    identityNotFoundRetries: number
    separator: string
    fusionFormNamePattern: string
    nonAggregableTypes: readonly string[]
    concurrency: (typeof internalConfigFusionService)['concurrency']
    fusionAccountRefreshThresholdInSeconds: number
    fusionMaxCandidatesForFormMin: number
    fusionMaxCandidatesForFormMax: number
} {
    const { clientService, messagingService, fusionService, formService } = internalConfig
    return {
        ...clientService,
        ...messagingService,
        ...fusionService,
        ...formService,
    }
}
