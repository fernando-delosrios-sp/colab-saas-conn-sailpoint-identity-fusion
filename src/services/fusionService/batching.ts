import { LogService } from '../logService'
import { FusionConfig } from '../../model/config'
import { runtimeDefaults } from '../../data/config'
import { createBatchProgressLogger, promiseAllBatched, yieldToEventLoop } from './collections'

/**
 * Batching policy and execution helpers for fusion processing.
 *
 * These are stateless functions: callers provide the config/log context.
 * Keeping them as utilities avoids a short-lived "service" object that only
 * forwarded to the helpers in collections.ts.
 */

/** Configured batch size for managed-account processing. */
export function getManagedAccountsBatchSize(config: FusionConfig): number {
    return config.managedAccountsBatchSize ?? runtimeDefaults.managedAccountsBatchSize
}

/**
 * Fusion/identity phases use Promise.all batches; each task runs a large synchronous preamble
 * before its first await. Capping concurrency avoids stacking tens of accounts on one turn.
 */
export function getFusionParallelBatchSize(config: FusionConfig): number {
    return Math.max(1, Math.min(getManagedAccountsBatchSize(config), 12))
}

/**
 * Yield at most this often while draining the managed-account queue (in addition to per-phase yields).
 * ScoringService already yields every 100 identity comparisons, so the outer loop does not need to
 * yield as frequently. 25 accounts per outer yield reduces setImmediate overhead without sacrificing
 * event-loop responsiveness for the SDK keep-alive and logger flush paths.
 */
export function getManagedAccountEventLoopYieldEvery(config: FusionConfig): number {
    return Math.max(1, Math.min(getManagedAccountsBatchSize(config), 25))
}

/**
 * Wraps promiseAllBatched with the service's configured batch size and an
 * automatically created progress logger. Removes the repetitive boilerplate
 * of calculating batchSize / total and wiring up createBatchProgressLogger.
 */
export async function batchProcess<T, R>(
    items: T[],
    label: string,
    fn: (item: T) => Promise<R>,
    config: FusionConfig,
    log: LogService,
    batchSize?: number
): Promise<R[]> {
    const size = batchSize ?? getFusionParallelBatchSize(config)
    return promiseAllBatched(items, fn, size, createBatchProgressLogger(log, label, items.length, size))
}

/**
 * Yields to the event loop so buffered I/O (e.g. logger writes) can drain.
 */
export { yieldToEventLoop }

/**
 * Fire-and-forget batched iteration with the configured batch size.
 */

