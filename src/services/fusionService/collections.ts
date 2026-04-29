/**
 * Collection utility functions and async batch processing helpers.
 */

// ============================================================================
// Map Operations
// ============================================================================

/**
 * Converts a Map to an Array of its values
 */
export function mapValuesToArray<K, V>(map: Map<K, V>): V[] {
    return Array.from(map.values())
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Filters out null and undefined values from an array
 */
export function compact<T>(array: (T | null | undefined)[]): T[] {
    return array.filter((item): item is T => item !== null && item !== undefined)
}

// ============================================================================
// Async / Promise Operations
// ============================================================================

/**
 * Yields to the event loop so buffered I/O (e.g. pino logger writes to stdout) can drain.
 * The SailPoint SDK logger uses pino with async buffering; during intensive batch processing
 * the event loop stays busy and logs accumulate. A single setImmediate tick allows flushing.
 */
export function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve))
}

/**
 * Processes items in batches with a concurrency limit, avoiding unbounded Promise.all.
 *
 * Performance Optimization:
 * Plain `Promise.all(items.map(fn))` creates all promises simultaneously, holding
 * all intermediate results in memory and risking API rate limits. This utility
 * processes items in configurable chunks to bound peak memory usage.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param batchSize - Maximum number of concurrent promises (default: 50)
 * @returns Array of all results in order
 */
export async function promiseAllBatched<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    batchSize: number = 50,
    onBatchComplete?: (processed: number, total: number) => void
): Promise<R[]> {
    const results: R[] = []
    const total = items.length
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        results.push(...(await Promise.all(batch.map(fn))))
        await yieldToEventLoop()
        onBatchComplete?.(Math.min(i + batchSize, total), total)
    }
    return results
}

/**
 * Processes items in batches without collecting results (fire-and-forget style).
 * Useful when the mapping function has side effects but no meaningful return value.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param batchSize - Maximum number of concurrent promises (default: 50)
 */
export async function forEachBatched<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    batchSize: number = 50
): Promise<void> {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        await Promise.all(batch.map(fn))
        await yieldToEventLoop()
    }
}
