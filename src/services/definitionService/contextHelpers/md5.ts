import { createHash } from 'crypto'

/**
 * Compute MD5 digest of input text for Velocity templates.
 * Returns lowercase hex; empty string for null, undefined, non-string, or whitespace-only input.
 */
export function MD5(text: unknown): string {
    if (text === null || text === undefined) return ''
    if (typeof text !== 'string') return ''
    const trimmed = text.trim()
    if (!trimmed) return ''
    return createHash('md5').update(trimmed).digest('hex')
}
