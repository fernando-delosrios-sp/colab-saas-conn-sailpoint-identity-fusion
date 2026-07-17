import { FusionAccountState } from '../fusionAccountState'
import { addHistory } from './historyRules'

/**
 * Minimal stub for account-id collection rules.
 * Mirrors the current `FusionAccount.addAccountId` behavior while operating
 * directly on the supplied state container.
 */
export function addAccountId(state: FusionAccountState, id: string, message?: string): void {
    const initialSize = state.accountIds.size
    state.accountIds.add(id)
    const added = state.accountIds.size > initialSize
    if (added && message) {
        addHistory(state, message)
    }
}

/**
 * Minimal stub for account-id collection rules.
 * Mirrors the current `FusionAccount.removeMissingAccountId` behavior while operating
 * directly on the supplied state container.
 */
export function removeMissingAccountId(state: FusionAccountState, id: string, message?: string): void {
    const removed = state.missingAccountIds.delete(id)
    if (removed && message) {
        addHistory(state, message)
    }
}
