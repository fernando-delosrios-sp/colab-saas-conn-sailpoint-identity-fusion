/**
 * Collection utility functions and async batch processing helpers.
 */

import type { FusionConfig } from '../../model/config'
import { runtimeDefaults } from '../../data/config'
import type { LogService } from '../logService'
import { yieldToEventLoop } from '../../utils/yieldToEventLoop'


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
 * Updates operation run progress for heartbeat STATUS lines (no standalone log line).
 */
function createBatchProgressUpdater(
    log: LogService,
    totalItems: number,
    progressUnit: string
): (processed: number, total: number) => void {
    if (totalItems === 0) return () => {}
    return (processed: number, total: number) => {
        log.setProgress(processed, total, progressUnit)
    }
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

// ============================================================================
// Batch Processing Helpers
// ============================================================================

/**
 * Batch processing with config-driven batch sizing and progress logging.
 * Wraps promiseAllBatched with the configured batch size and an
 * automatically created progress logger.
 *
 * @param progressUnit - Heartbeat progress unit (default: `processed`)
 */
export async function batchProcess<T, R>(
    items: T[],
    label: string,
    fn: (item: T) => Promise<R>,
    config: FusionConfig,
    log: LogService,
    batchSize?: number,
    progressUnit = 'processed'
): Promise<R[]> {
    const size = batchSize ?? getFusionParallelBatchSize(config)
    return promiseAllBatched(items, fn, size, createBatchProgressUpdater(log, items.length, progressUnit))
}

/** Configured batch size for managed-account processing. */
export function getManagedAccountsBatchSize(config: FusionConfig): number {
    return config.managedAccountsBatchSize ?? runtimeDefaults.managedAccountsBatchSize
}

/** Fusion/identity phases use Promise.all batches with capped concurrency. */
export function getFusionParallelBatchSize(config: FusionConfig): number {
    return Math.max(1, Math.min(getManagedAccountsBatchSize(config), 12))
}

/**
 * Configured concurrency cap for managed-account identity and deferred scoring.
 * Defaults to 12 (same as fusion parallel cap) but is independent of
 * {@link getManagedAccountsBatchSize} batch grouping.
 */
export function getScoringMaxConcurrency(config: FusionConfig): number {
    return Math.max(1, Math.min(config.scoringMaxConcurrency ?? runtimeDefaults.scoringMaxConcurrency, 50))
}

/** Yield at most this often while draining the managed-account queue. */
export function getManagedAccountEventLoopYieldEvery(config: FusionConfig): number {
    return Math.max(1, Math.min(getManagedAccountsBatchSize(config), 25))
}


