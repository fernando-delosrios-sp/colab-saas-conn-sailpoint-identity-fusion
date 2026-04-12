import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'

/**
 * Tries to access the ServiceRegistry for rich logging (crash/warn/error).
 * Returns undefined if not yet initialized (e.g. during config loading).
 * Lazy-imported to avoid circular dependency with ServiceRegistry -> LogService -> assert.
 */
function tryGetServiceRegistry(): any {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- break cycle: ServiceRegistry -> LogService -> assert
        const { ServiceRegistry } = require('../services/serviceRegistry')
        return ServiceRegistry.getCurrent?.()
    } catch {
        return undefined
    }
}

/**
 * Hard assertion - throws an error if condition is false or value is null/undefined.
 * Uses ServiceRegistry logger when available, falls back to SDK logger.
 *
 * Supports two patterns:
 * 1. Direct value: assert(value, 'message') - narrows value to non-null/non-undefined
 * 2. Boolean expression: assert(condition, 'message') - checks condition is true
 */
export function assert<T>(value: T | null | undefined, message: string): asserts value is T
export function assert(condition: boolean, message: string): asserts condition
export function assert<T>(
    valueOrCondition: T | null | undefined | boolean,
    message: string
): asserts valueOrCondition is T {
    const isNullish = valueOrCondition === null || valueOrCondition === undefined
    const isFalse = valueOrCondition === false

    if (isNullish || isFalse) {
        const registry = tryGetServiceRegistry()
        if (registry?.log) {
            registry.log.crash(message)
        } else {
            logger.error(message)
            throw new ConnectorError(message, ConnectorErrorType.Generic)
        }
    }
}

/**
 * Soft assertion - logs a warning/error but doesn't throw.
 * Uses ServiceRegistry logger when available, falls back to SDK logger.
 * @returns true if assertion passed, false if it failed
 */
export function softAssert<T>(
    valueOrCondition: T | null | undefined,
    message: string,
    level: 'warn' | 'error' = 'warn'
): valueOrCondition is NonNullable<T> {
    const isNullish = valueOrCondition === null || valueOrCondition === undefined
    const isFalse = valueOrCondition === false

    if (isNullish || isFalse) {
        const registry = tryGetServiceRegistry()
        if (registry?.log) {
            if (level === 'error') {
                registry.log.error(message)
            } else {
                registry.log.warn(message)
            }
        } else {
            if (level === 'error') {
                logger.error(message)
            } else {
                logger.warn(message)
            }
        }
    }
    return !(isNullish || isFalse)
}
