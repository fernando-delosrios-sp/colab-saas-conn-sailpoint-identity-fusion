import { logger } from '@sailpoint/connector-sdk'

/**
 * Wraps a Velocity context helper that may return undefined or null.
 * Returns '' on failure so Velocity renders nothing instead of the raw expression.
 */
export function withVelocityHelperFallback<T extends (...args: any[]) => any>(
    helperName: string,
    fn: T
): (...args: Parameters<T>) => Exclude<ReturnType<T>, undefined | null> | '' {
    return (...args: Parameters<T>): Exclude<ReturnType<T>, undefined | null> | '' => {
        try {
            const result = fn(...args)
            if (result === undefined || result === null) {
                logger.debug(`${helperName} returned ${result} for input: ${JSON.stringify(args[0])}`)
                return ''
            }
            return result
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            logger.error(`${helperName} threw unexpected error for input ${JSON.stringify(args[0])}: ${msg}`)
            return ''
        }
    }
}
