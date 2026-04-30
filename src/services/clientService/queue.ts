import { logger } from '@sailpoint/connector-sdk'
import { QueueItem, QueueStats, QueueConfig, QueuePriority } from './types'
import { shouldRetry, calculateRetryDelay } from './helpers'
import { internalConfig } from '../../data/config'

/** Ordered list of priorities from highest to lowest, used when dequeueing. */
const PRIORITY_ORDER = [QueuePriority.HIGH, QueuePriority.MEDIUM, QueuePriority.LOW] as const

/**
 * Advanced API call queue manager with throttling, retry, and concurrency control.
 * Note: Pagination is handled at the ClientService level, not in the queue.
 *
 * Priority is implemented via separate sub-queues (one per level) rather than a
 * single sorted array. This gives O(1) insertion and O(1) dequeue regardless of
 * queue depth, avoiding the O(n) findIndex + splice that a sorted array requires.
 */
export class ApiQueue {
    /** Per-priority FIFO queues. Insertion and dequeue are both O(1). */
    private queues: Map<QueuePriority, QueueItem[]> = new Map([
        [QueuePriority.HIGH, []],
        [QueuePriority.MEDIUM, []],
        [QueuePriority.LOW, []],
    ])
    private activeRequests: number = 0
    private processing: boolean = false
    private stats: QueueStats = {
        totalProcessed: 0,
        totalFailed: 0,
        totalRetries: 0,
        averageWaitTime: 0,
        averageProcessingTime: 0,
        queueLength: 0,
        activeRequests: 0,
    }
    // Circular buffers for rolling wait/processing time windows — O(1) insert + evict.
    // Each buffer is a fixed-size Float64Array with a write index that wraps modulo maxStatsSamples.
    private waitTimesBuffer: Float64Array = new Float64Array(internalConfig.clientService.maxStatsSamples)
    private waitTimesIndex: number = 0
    private waitTimesCount: number = 0
    private waitTimesSum: number = 0

    private processingTimesBuffer: Float64Array = new Float64Array(internalConfig.clientService.maxStatsSamples)
    private processingTimesIndex: number = 0
    private processingTimesCount: number = 0
    private processingTimesSum: number = 0

    private lastRequestTime: number = 0
    private minRequestInterval: number

    constructor(private config: QueueConfig) {
        this.minRequestInterval = 1000 / config.requestsPerSecond
        this.startProcessing()
    }

    /**
     * Total number of items waiting across all priority sub-queues.
     */
    private totalQueueLength(): number {
        let total = 0
        for (const q of this.queues.values()) total += q.length
        return total
    }

    /**
     * Dequeue the highest-priority waiting item, or undefined if all queues are empty.
     */
    private dequeueNext(): QueueItem | undefined {
        for (const priority of PRIORITY_ORDER) {
            const q = this.queues.get(priority)!
            if (q.length > 0) return q.shift()
        }
        return undefined
    }

    /**
     * Sub-queue key for an item — must match {@link enqueueItem} so abort/remove paths stay consistent.
     */
    private queueKeyForItem(item: { priority: QueuePriority }): QueuePriority {
        return this.config.enablePriority ? item.priority : QueuePriority.MEDIUM
    }

    /**
     * Push an item onto the appropriate sub-queue.
     * When priority is disabled all items go to MEDIUM (FIFO behaviour is preserved).
     */
    private enqueueItem(item: QueueItem): void {
        this.queues.get(this.queueKeyForItem(item))!.push(item)
    }

    /**
     * Add a request to the queue
     */
    async enqueue<T>(
        execute: () => Promise<T>,
        options: {
            priority?: QueuePriority
            maxRetries?: number
            id?: string
            abortSignal?: AbortSignal
        } = {}
    ): Promise<T> {
        const item: QueueItem<T> = {
            id: options.id || `req-${Date.now()}-${Math.random()}`,
            priority: options.priority ?? QueuePriority.MEDIUM,
            execute,
            resolve: () => {},
            reject: () => {},
            retryCount: 0,
            maxRetries: options.maxRetries ?? this.config.maxRetries,
            createdAt: Date.now(),
            abortSignal: options.abortSignal,
        }

        return new Promise<T>((resolve, reject) => {
            item.resolve = resolve
            item.reject = reject

            this.enqueueItem(item)

            // Handle pre-flight abort
            if (options.abortSignal?.aborted) {
                const subQueue = this.queues.get(this.queueKeyForItem(item))!
                const idx = subQueue.indexOf(item)
                if (idx !== -1) subQueue.splice(idx, 1)
                this.stats.queueLength = this.totalQueueLength()
                item.reject(new Error('Aborted'))
                return
            }

            // Handle abort while queued
            options.abortSignal?.addEventListener(
                'abort',
                () => {
                    const subQueue = this.queues.get(this.queueKeyForItem(item))!
                    const index = subQueue.indexOf(item)
                    if (index !== -1) {
                        subQueue.splice(index, 1)
                        this.stats.queueLength = this.totalQueueLength()
                        item.reject(new Error('Aborted'))
                    }
                },
                { once: true }
            )

            this.stats.queueLength = this.totalQueueLength()

            // Process immediately if not at capacity
            this.processQueue()
        })
    }

    /**
     * Start the queue processing loop
     */
    private startProcessing(): void {
        if (this.processing) return
        this.processing = true
        this.processQueue()
    }

    /**
     * Process the queue
     * Each request is executed individually, respecting concurrency and throttling limits.
     * Pagination is handled at the ClientService level, not here.
     */
    private async processQueue(): Promise<void> {
        if (!this.processing) return

        // Process requests up to the concurrency limit
        while (this.totalQueueLength() > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
            const item = this.dequeueNext()!
            this.stats.queueLength = this.totalQueueLength()

            // Execute the request immediately (it will handle its own throttling)
            // Don't await - let multiple requests run concurrently up to maxConcurrentRequests
            this.executeRequest(item).catch(() => {
                // Error already handled in executeRequest
            })
        }

        // Continue processing if there are items in queue and capacity available
        if (this.totalQueueLength() > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
            setTimeout(() => this.processQueue(), internalConfig.clientService.queueProcessingIntervalMs)
        }
    }

    /**
     * Execute a single request with throttling and retry
     */
    private async executeRequest<T>(item: QueueItem<T>): Promise<void> {
        this.activeRequests++
        this.stats.activeRequests = this.activeRequests

        const waitTime = Date.now() - item.createdAt
        this.pushStat('wait', waitTime)

        // Throttle: ensure minimum time between requests
        const timeSinceLastRequest = Date.now() - this.lastRequestTime
        if (timeSinceLastRequest < this.minRequestInterval) {
            await this.sleep(this.minRequestInterval - timeSinceLastRequest)
        }

        const startTime = Date.now()
        this.lastRequestTime = Date.now()

        try {
            if (item.abortSignal?.aborted) {
                throw new Error('Aborted')
            }
            const result = await item.execute()
            const processingTime = Date.now() - startTime
            this.pushStat('processing', processingTime)

            this.stats.totalProcessed++
            this.updateStats()
            item.resolve(result)
        } catch (error: unknown) {
            const processingTime = Date.now() - startTime
            this.pushStat('processing', processingTime)

            // Check if we should retry
            if (shouldRetry(error) && item.retryCount < item.maxRetries) {
                item.retryCount++
                this.stats.totalRetries++
                this.updateStats()

                const delay = calculateRetryDelay(item.retryCount, error)
                logger.debug(
                    `Retrying request [${item.id}] (attempt ${item.retryCount}/${item.maxRetries}) after ${delay}ms`
                )

                await this.sleep(delay)

                this.enqueueItem(item)
                this.stats.queueLength = this.totalQueueLength()
            } else {
                this.stats.totalFailed++
                this.updateStats()
                item.reject(error)
            }
        } finally {
            this.activeRequests--
            this.stats.activeRequests = this.activeRequests

            // Continue processing
            setTimeout(() => this.processQueue(), 0)
        }
    }

    /**
     * Get current queue statistics
     */
    getStats(): QueueStats {
        return { ...this.stats }
    }

    /**
     * Push a new sample into the circular buffer for the given stat type.
     * When the buffer is full, the oldest sample's contribution is subtracted from the running sum
     * before it is overwritten — making both insertion and eviction O(1).
     */
    private pushStat(type: 'wait' | 'processing', value: number): void {
        if (type === 'wait') {
            const idx = this.waitTimesIndex % internalConfig.clientService.maxStatsSamples
            if (this.waitTimesCount === internalConfig.clientService.maxStatsSamples) {
                // Evict the oldest sample from the running sum
                this.waitTimesSum -= this.waitTimesBuffer[idx]
            } else {
                this.waitTimesCount++
            }
            this.waitTimesBuffer[idx] = value
            this.waitTimesSum += value
            this.waitTimesIndex++
        } else {
            const idx = this.processingTimesIndex % internalConfig.clientService.maxStatsSamples
            if (this.processingTimesCount === internalConfig.clientService.maxStatsSamples) {
                this.processingTimesSum -= this.processingTimesBuffer[idx]
            } else {
                this.processingTimesCount++
            }
            this.processingTimesBuffer[idx] = value
            this.processingTimesSum += value
            this.processingTimesIndex++
        }
    }

    /**
     * Update statistics — O(1) using running sums maintained by pushStat.
     */
    private updateStats(): void {
        if (this.waitTimesCount > 0) {
            this.stats.averageWaitTime = this.waitTimesSum / this.waitTimesCount
        }
        if (this.processingTimesCount > 0) {
            this.stats.averageProcessingTime = this.processingTimesSum / this.processingTimesCount
        }
    }

    /**
     * Clear the queue
     */
    clear(): void {
        for (const q of this.queues.values()) {
            q.forEach((item) => item.reject(new Error('Queue cleared')))
            q.length = 0
        }
        this.stats.queueLength = 0
    }

    /**
     * Stop processing
     */
    stop(): void {
        this.processing = false
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }
}
