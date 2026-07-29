/** Strip undefined values so JSON serialization succeeds (e.g. recording/replay adapters). */
export function sanitizeForJson(value: unknown): unknown {
    if (value === undefined || value === null) return value
    return JSON.parse(JSON.stringify(value))
}

/** Serialize ISC API payloads for recording; prefers response body over axios wrapper. */
export function sanitizeApiPayload(value: unknown): unknown {
    if (value === undefined || value === null) return value
    try {
        if (typeof value === 'object' && value !== null && 'data' in value) {
            const wrapped = value as { data?: unknown; status?: unknown; statusText?: unknown }
            return JSON.parse(
                JSON.stringify({
                    data: wrapped.data,
                    status: wrapped.status,
                    statusText: wrapped.statusText,
                })
            )
        }
        return JSON.parse(JSON.stringify(value))
    } catch {
        return { _recordingError: 'Could not serialize API payload' }
    }
}

