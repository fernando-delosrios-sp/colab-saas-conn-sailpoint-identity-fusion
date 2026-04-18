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
