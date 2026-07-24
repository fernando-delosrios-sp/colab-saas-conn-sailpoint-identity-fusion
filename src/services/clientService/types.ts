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
    rateLimitWindowMs?: number
    rateLimitMaxRequests?: number
}

/** Base policy for `client.call()`. */
export interface CallPolicy {
    context?: string
    priority?: QueuePriority
    throwOnError?: boolean
    noRetry?: boolean
    abortSignal?: AbortSignal
}

interface OffsetPaginate {
    mode: 'sequential' | 'parallel'
    baseParams?: Record<string, unknown>
    limit?: number
    batchSize?: number
}

interface SearchAfterPaginate {
    mode: 'searchAfter'
    search: Record<string, unknown> & { indices: string[]; query: Record<string, unknown> }
}

export interface PaginatePolicy extends CallPolicy {
    paginate: OffsetPaginate | SearchAfterPaginate
}

export class PaginationError extends Error {
    constructor(message: string, public readonly itemsCollected: number) {
        super(message)
        this.name = 'PaginationError'
    }
}

