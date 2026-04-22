/**
 * Collection utility functions and async helpers.
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
