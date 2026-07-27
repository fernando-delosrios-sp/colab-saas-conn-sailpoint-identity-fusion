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

/**
 * Wrapper for managing counter state across connector runs
 */
export class StateWrapper {
    private state: Map<string, number> = new Map()
    private locks?: InMemoryLockService

    constructor(state?: any, locks?: InMemoryLockService) {
        this.locks = locks
        let keyCount = 0
        try {
            keyCount =
                state && typeof state === 'object' && !Array.isArray(state) ? Object.keys(state).length : 0
            if (state && typeof state === 'object' && Object.keys(state).length > 0) {
                this.state = new Map(Object.entries(state))
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

    private _doInit(key: string, start: number) {
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
                this._doInit(key, start)
            })
        } else {
            this._doInit(key, start)
        }
    }

    /**
     * Get the state as a plain object for saving
     */
    public getState(): { [key: string]: number } {
        return Object.fromEntries(this.state)
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
    public entries(): Iterable<[string, number]> {
        return this.state.entries()
    }

    /**
     * Get value for a key.
     */
    public get(key: string): number | undefined {
        return this.state.get(key)
    }

    /**
     * Set value for a key.
     */
    public set(key: string, value: number): void {
        this.state.set(key, value)
    }
}
