/**
 * Yields to the event loop so buffered I/O (e.g. pino logger writes to stdout) can drain.
 * The SailPoint SDK logger uses pino with async buffering; during intensive batch processing
 * the event loop stays busy and logs accumulate. A single setImmediate tick allows flushing.
 */
export function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve))
}
