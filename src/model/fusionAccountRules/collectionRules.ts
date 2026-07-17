import { FusionAccountState } from '../fusionAccountState'
import { addHistory } from './historyRules'

/**
 * Generic helper: add an item to a Set and optionally log history.
 */
export function addToSet<T>(state: FusionAccountState, set: Set<T>, item: T, message?: string): boolean {
    const initialSize = set.size
    set.add(item)
    const added = set.size > initialSize
    if (added && message) {
        addHistory(state, message)
    }
    return added
}

/**
 * Generic helper: remove an item from a Set and optionally log history.
 */
export function removeFromSet<T>(state: FusionAccountState, set: Set<T>, item: T, message?: string): boolean {
    const removed = set.delete(item)
    if (removed && message) {
        addHistory(state, message)
    }
    return removed
}

/**
 * Adds an account ID to the correlated account set.
 */
export function addAccountId(state: FusionAccountState, id: string, message?: string): void {
    addToSet(state, state.accountIds, id, message)
}

/**
 * Removes an account ID from the correlated account set.
 */
export function removeAccountId(state: FusionAccountState, id: string, message?: string): void {
    removeFromSet(state, state.accountIds, id, message)
}

/**
 * Adds an account ID to the missing (uncorrelated) account set.
 */
export function addMissingAccountId(state: FusionAccountState, id: string, message?: string): void {
    addToSet(state, state.missingAccountIds, id, message)
}

/**
 * Removes an account ID from the missing (uncorrelated) account set.
 */
export function removeMissingAccountId(state: FusionAccountState, id: string, message?: string): void {
    removeFromSet(state, state.missingAccountIds, id, message)
}

/**
 * Adds a source name to the account's source set.
 */
export function addSource(state: FusionAccountState, source: string, message?: string): void {
    addToSet(state, state.sources, source, message)
}

/**
 * Removes a source name from the account's source set.
 */
export function removeSource(state: FusionAccountState, source: string, message?: string): void {
    removeFromSet(state, state.sources, source, message)
}
