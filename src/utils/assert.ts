import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'

/**
 * Tries to access the ServiceRegistry for rich logging (crash/warn/error).
 * Returns undefined if not yet initialized (e.g. during config loading).
 *
 * Uses a top-level import. The circular dependency
 * (ServiceRegistry -> LogService -> assert) is broken by the fact that
 * `ServiceRegistry` is only ACCESSED at call time (inside `tryGetServiceRegistry`),
 * and Vitest's ESM live-binding semantics ensure the binding is resolved by
 * the time the function is called (module graph finishes loading before
 * any test runs).
 */
import { ServiceRegistry } from '../services/serviceRegistry'

function tryGetServiceRegistry(): ServiceRegistry | undefined {
    try {
        return ServiceRegistry.getCurrent()
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
        if (registry && typeof registry === 'object' && 'log' in registry) {
            (registry as { log: { crash: (msg: string) => void } }).log.crash(message)
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
        if (registry && typeof registry === 'object' && 'log' in registry) {
            const log = (registry as { log: { error: (msg: string) => void; warn: (msg: string) => void } }).log
            if (level === 'error') {
                log.error(message)
            } else {
                log.warn(message)
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
