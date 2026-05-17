/**
 * Priority levels for queue items
 */
export enum QueuePriority {
    LOW = 0,
    MEDIUM = 1,
    HIGH = 2,
}

/**
 * Queue item interface
 */
export interface QueueItem<T = any> {
    id: string
    priority: QueuePriority
    execute: () => Promise<T>
    resolve: (value: T) => void
    reject: (reason: unknown) => void
    retryCount: number
    maxRetries: number
    createdAt: number
    abortSignal?: AbortSignal
    label?: string
    noRetry?: boolean
}

/**
 * Serialisable, sanitized view of a queued or active item.
 * Excludes function references (execute, resolve, reject, abortSignal)
 * so it is safe for logging, transmission, and external inspection.
 */
export interface QueuedItemInfo {
    id: string
    priority: QueuePriority
    label?: string
    createdAt: number
    retryCount: number
    maxRetries: number
    waitTimeMs: number
    noRetry?: boolean
}

/**
 * Queue statistics
 */
export interface QueueStats {
    totalProcessed: number
    totalFailed: number
    totalRetries: number
    averageWaitTime: number
    averageProcessingTime: number
    queueLength: number
    activeRequests: number
}

/**
 * Configuration for the API queue
 */
export interface QueueConfig {
    requestsPerSecond: number
    maxConcurrentRequests: number
    maxRetries: number
    enablePriority: boolean
}
