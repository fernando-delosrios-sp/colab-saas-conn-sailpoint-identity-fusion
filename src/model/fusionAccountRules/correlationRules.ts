import { FusionAccountState } from '../fusionAccountState'
import { FusionAction } from '../fusionAction'
import { StatusEntitlement } from '../statusEntitlement'
import { addAccountId, removeMissingAccountId } from './collectionRules'

/**
 * Marks a managed account as correlated by adding it to the account IDs set
 * and removing it from the missing set. Optionally tracks a correlation promise.
 */
export function setCorrelatedAccount(
    state: FusionAccountState,
    accountId: string,
    promise?: Promise<unknown>
): void {
    addAccountId(state, accountId)
    removeMissingAccountId(state, accountId)
    if (promise) {
        addCorrelationPromise(state, accountId, promise)
    }
}

/** Tracks a correlation promise for deferred resolution. */
export function addCorrelationPromise(
    state: FusionAccountState,
    _accountId: string,
    promise: Promise<unknown>
): void {
    if (!promise) return
    // The promise handler (in correlateAccounts) will call setCorrelatedAccount on success
    // Track the promise - it will be resolved in getISCAccount via resolvePendingOperations
    state.correlationPromises.push(promise)
}

/** Resolves all pending correlation promises. */
export async function resolveCorrelationPromises(state: FusionAccountState): Promise<void> {
    if (state.correlationPromises.length === 0) return

    // Wait for all correlation promises to complete
    // setCorrelatedAccount is called in the promise handlers, which updates state
    await Promise.allSettled(state.correlationPromises)
    state.correlationPromises = []
}

/**
 * Update correlation status and action based on missing accounts.
 * Should be called after all layers are added.
 */
export function updateCorrelationStatus(state: FusionAccountState): void {
    const hasAllAccountsCorrelated = state.missingAccountIds.size === 0

    if (hasAllAccountsCorrelated) {
        state.statuses.delete(StatusEntitlement.Uncorrelated)
        state.actions.add(FusionAction.Correlated)
        state.uncorrelated = false
    } else {
        state.statuses.add(StatusEntitlement.Uncorrelated)
        state.actions.delete(FusionAction.Correlated)
        state.uncorrelated = true
    }
}
