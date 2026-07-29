/** Strip undefined values so JSON serialization succeeds (e.g. recording/replay adapters). */
export function sanitizeForJson(value: unknown): unknown {
    if (value === undefined || value === null) return value
    return JSON.parse(JSON.stringify(value))
}
