import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { InMemoryLockService } from '../lockService'
import { ServiceRegistry } from '../serviceRegistry'
import { bootstrapLog } from '../logService/bootstrapLog'

function logDetail(data: Record<string, unknown>): void {
    try {
        ServiceRegistry.getCurrent().log.detail(data)
    } catch {
        bootstrapLog.detail(data)
    }
}

function logDebug(message: string): void {
    try {
        ServiceRegistry.getCurrent().log.debug(message)
    } catch {
        bootstrapLog.debug(message)
    }
}

function logError(message: string): void {
    try {
        ServiceRegistry.getCurrent().log.error(message)
    } catch {
        bootstrapLog.error(message)
    }
}

// ============================================================================
// StateWrapper Class
// ============================================================================

/** One attribute counter, or one number per base value. */
export type AttributeCounterState = number | Record<string, number>

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function copyIncomingCounter(value: unknown): AttributeCounterState | undefined {
    if (typeof value === 'number') return value
    if (isPlainObject(value)) return { ...value } as Record<string, number>
    if (value === undefined) return undefined
    return value as AttributeCounterState
}

/**
 * Wrapper for managing counter state across connector runs.
 * An attribute counter is one number, or a map of base value to number when
 * per-base counting is on.
 */
export class StateWrapper {
    private state: Map<string, AttributeCounterState> = new Map()
    private locks?: InMemoryLockService

    constructor(state?: any, locks?: InMemoryLockService) {
        this.locks = locks
        let keyCount = 0
        try {
            keyCount = state && typeof state === 'object' && !Array.isArray(state) ? Object.keys(state).length : 0
            if (state && typeof state === 'object' && !Array.isArray(state) && Object.keys(state).length > 0) {
                this.state = new Map()
                for (const [key, value] of Object.entries(state)) {
                    const copied = copyIncomingCounter(value)
                    if (copied !== undefined) this.state.set(key, copied)
                }
                logDebug(`Loaded ${this.state.size} counter values from state`)
            } else {
                this.state = new Map()
                logDebug('Initializing with empty state (no previous counter values)')
            }
        } catch (error) {
            logError(`Failed to convert state object to Map: ${error}. Initializing with empty Map`)
            this.state = new Map()
        }
        logDetail({ action: 'stateWrapper init', keys: keyCount })
    }

    /**
     * Get a non-persistent counter function (for unique attributes)
     */
    static getCounter(): () => number {
        let counter = 0
        return () => {
            counter++
            return counter
        }
    }

    /**
     * Get a persistent counter function (for counter-based attributes)
     * Returns an async function that uses locks for thread safety in parallel processing
     * Counters must be initialized via initializeCounters() before use
     */
    getCounter(key: string): () => Promise<number> {
        logDebug(`Getting counter for key: ${key}`)
        return async () => {
            const lockKey = `counter:${key}`
            return await this.locks!.withLock(lockKey, async () => {
                const currentValue = this.state.get(key)

                if (currentValue === undefined) {
                    throw new ConnectorError(
                        `Counter "${key}" was not initialized. Ensure the attribute definition for "${key}" is configured and initializeCounters() has been called.`,
                        ConnectorErrorType.Generic
                    )
                }
                if (typeof currentValue !== 'number') {
                    throw new ConnectorError(
                        `Counter "${key}" is stored per base value and cannot increment as one number.`,
                        ConnectorErrorType.Generic
                    )
                }
                const nextValue = currentValue + 1
                this.state.set(key, nextValue)
                const verifyValue = this.state.get(key)
                if (verifyValue !== nextValue) {
                    throw new ConnectorError(
                        `Counter state update failed for "${key}": expected ${nextValue} but got ${verifyValue}. This may indicate a concurrency issue.`,
                        ConnectorErrorType.Generic
                    )
                }
                logDebug(
                    `Persistent counter for key ${key} incremented from ${currentValue} to: ${nextValue} (verified: ${verifyValue})`
                )
                return nextValue
            })
        }
    }

    private doInit(key: string, start: number) {
        if (!this.state.has(key)) {
            this.state.set(key, start - 1)
            logDebug(`Initialized counter ${key} to ${start - 1} (first value will be ${start})`)
        }
    }

    /**
     * Initialize a counter with a start value if it doesn't exist
     * Sets the counter to (start - 1) so that the first increment returns 'start'
     * Uses locks for thread safety in parallel processing
     */
    async initCounter(key: string, start: number): Promise<void> {
        const lockKey = `counter:${key}`
        if (this.locks) {
            await this.locks.withLock(lockKey, async () => {
                this.doInit(key, start)
            })
        } else {
            this.doInit(key, start)
        }
    }

    /**
     * Issue the next number for one base value.
     * The lock is `counter:<attribute>:<base>`, so different bases do not block each other.
     * When `maxDigits` is set, a next number wider than that width is rejected and not stored.
     */
    async allocateBaseCounter(attribute: string, base: string, start: number, maxDigits?: number): Promise<number> {
        const lockKey = `counter:${attribute}:${base}`
        const allocate = async () => {
            const map = this.ensureBaseMap(attribute)
            if (map[base] === undefined) {
                map[base] = start - 1
            }
            const next = map[base] + 1
            if (maxDigits !== undefined && String(next).length > maxDigits) {
                throw new ConnectorError(
                    `Unique attribute "${attribute}" counter does not fit Minimum counter digits.`,
                    ConnectorErrorType.Generic
                )
            }
            map[base] = next
            logDebug(`Per-base counter ${attribute}[${base}] incremented to ${next}`)
            return next
        }
        if (this.locks) {
            return await this.locks.withLock(lockKey, allocate)
        }
        return await allocate()
    }

    private ensureBaseMap(attribute: string): Record<string, number> {
        const existing = this.state.get(attribute)
        if (existing === undefined) {
            const created: Record<string, number> = {}
            this.state.set(attribute, created)
            return created
        }
        if (typeof existing === 'number' || !isPlainObject(existing)) {
            throw new ConnectorError(
                `Unique attribute "${attribute}" saved counter state does not match Per base value counter?. Switch Per base value counter? back or reset Fusion state.`,
                ConnectorErrorType.Generic
            )
        }
        return existing
    }

    /**
     * Get the state as a plain object for saving.
     * Base-value keys are copied so the saved object is the readable base value.
     */
    public getState(): { [key: string]: AttributeCounterState } {
        const out: { [key: string]: AttributeCounterState } = {}
        for (const [key, value] of this.state) {
            if (typeof value === 'number') {
                out[key] = value
            } else {
                out[key] = { ...value }
            }
        }
        return out
    }

    /**
     * Get number of entries in the state map.
     */
    public getSize(): number {
        return this.state.size
    }

    /**
     * Get an iterator over [key, value] entries.
     */
    public entries(): Iterable<[string, AttributeCounterState]> {
        return this.state.entries()
    }

    /**
     * Get value for a key.
     */
    public get(key: string): AttributeCounterState | undefined {
        return this.state.get(key)
    }

    /**
     * Set value for a key.
     * A base-value map is copied so later edits to the caller's object do not change saved state.
     */
    public set(key: string, value: AttributeCounterState): void {
        if (typeof value === 'number') {
            this.state.set(key, value)
            return
        }
        this.state.set(key, { ...value })
    }
}
