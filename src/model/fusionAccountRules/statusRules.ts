import { FusionAction } from '../fusionAction'
import { FusionAccountState } from '../fusionAccountState'
import { StatusEntitlement } from '../statusEntitlement'
import { addAccountId } from './collectionRules'

/**
 * Minimal stub for status rules.
 * Mirrors the current `FusionAccount.setUncorrelatedAccount` behavior while operating
 * directly on the supplied state container.
 */
export function setUncorrelatedAccount(state: FusionAccountState, accountId?: string): void {
    if (!accountId) return

    addAccountId(state, accountId)
    state.missingAccountIds.add(accountId)
    state.uncorrelated = true
    state.statuses.add(StatusEntitlement.Uncorrelated)
    state.actions.delete(FusionAction.Correlated)
}
