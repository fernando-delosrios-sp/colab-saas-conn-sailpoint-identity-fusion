import { logger } from '@sailpoint/connector-sdk'

/**
 * Serialize / deserialize JSON in Velocity templates. stringify returns '' on failure;
 * parse returns undefined for invalid input, non-strings, or empty trimmed text.
 */
export const JSONHelper = {
    stringify(value: unknown): string {
        try {
            const s = globalThis.JSON.stringify(value)
            if (s === undefined) return ''
            return s
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            logger.error(`JSON.stringify threw unexpected error: ${msg}`)
            return ''
        }
    },
    parse(text: unknown): unknown {
        if (text === null || text === undefined) return undefined
        if (typeof text !== 'string') return undefined
        const trimmed = text.trim()
        if (!trimmed) return undefined
        try {
            return globalThis.JSON.parse(trimmed)
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            if (error instanceof SyntaxError) {
                logger.debug(`JSON.parse failed for input ${globalThis.JSON.stringify(trimmed)}: ${msg}`)
            } else {
                logger.error(`JSON.parse threw unexpected error for input ${globalThis.JSON.stringify(trimmed)}: ${msg}`)
            }
            return undefined
        }
    },
}
