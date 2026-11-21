/**
 * Yields to the event loop so buffered I/O (e.g. pino logger writes to stdout) can drain.
 * The SailPoint SDK logger uses pino with async buffering; during intensive batch processing
 * the event loop stays busy and logs accumulate. A single setImmediate tick allows flushing.
 */
export function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve))
}

export interface ForEachChunkedOptions {
    chunkSize?: number
    onProgress?: (done: number, total: number) => void
}

/**
 * Processes an array synchronously in bounded chunks, yielding after each chunk.
 *
 * @param items - Items to process in their original order.
 * @param fn - Synchronous callback invoked once for each item.
 * @param options - Chunk size and optional post-yield progress callback.
 */
export async function forEachChunked<T>(
    items: readonly T[],
    fn: (item: T, index: number) => void,
    options: ForEachChunkedOptions = {}
): Promise<void> {
    if (items.length === 0) return

    const chunkSize = options.chunkSize ?? 250
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError('chunkSize must be a positive integer')
    }

    for (let start = 0; start < items.length; start += chunkSize) {
        const end = Math.min(start + chunkSize, items.length)
        for (let index = start; index < end; index++) {
            fn(items[index], index)
        }
        await yieldToEventLoop()
        options.onProgress?.(end, items.length)
    }
}

/**
 * Iterates any `Iterable<T>` in bounded synchronous chunks, yielding to the event loop
 * between chunks so large in-memory Map/Set scans do not starve timers or keep-alives.
 */
export async function forEachIterableChunked<T>(
    iterable: Iterable<T>,
    fn: (item: T, index: number) => void,
    chunkSize: number = 5_000
): Promise<void> {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError('chunkSize must be a positive integer')
    }
    let countInChunk = 0
    let index = 0
    for (const item of iterable) {
        fn(item, index++)
        countInChunk++
        if (countInChunk >= chunkSize) {
            countInChunk = 0
            await yieldToEventLoop()
        }
    }
    if (countInChunk > 0) {
        await yieldToEventLoop()
    }
}
