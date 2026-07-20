import { AccountV2025 as Account } from 'sailpoint-api-client'
import type { FusionAccountState } from './fusionAccountState'
import type { WorkQueue } from './fusionRun'
import { addAccountId, removeMissingAccountId } from './fusionAccountRules/collectionRules'
import { setUncorrelatedAccount } from './fusionAccountRules/statusRules'
import { addHistory } from './fusionAccountRules/historyRules'
import { setManagedAccount } from './fusionAccountRules/layerRules'
import { parseManagedAccountKey } from './managedAccountKey'
import { trimStr } from '../utils/safeRead'

/**
 * Identity-origin matching via index (O(1) lookup)
 */
export function processIdentityMatchedAccounts(
    state: FusionAccountState,
    queue: WorkQueue,
    addBlendHistory: boolean,
    skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
    onBlend?: (account: Account) => void
): void {
    const identityId = state.identityInfo?.id
    if (identityId === undefined) return

    const matchedIds = queue.getKeysForIdentity(identityId)
    if (!matchedIds || matchedIds.size === 0) return

    for (const id of matchedIds) {
        const account = queue.get(id)
        if (account) {
            addAccountId(state, id)
            removeMissingAccountId(state, id)
            const blended = setManagedAccount(state, account, addBlendHistory, skipBlendHistoryForManagedKeys)
            if (blended && onBlend) onBlend(account)
            queue.claimAccount(id, account.identityId)
        }
    }
    queue.claimAccountsForIdentity(identityId)
}

/**
 * Phase 2: Previous-run matching (scan remaining accounts)
 */
export function processPreviousRunMatchedAccounts(
    state: FusionAccountState,
    queue: WorkQueue,
    addBlendHistory: boolean,
    skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
    onBlend?: (account: Account) => void
): void {
    if (state.previousAccountIds.size === 0 && state.missingAccountIds.size === 0) return

    for (const [id, account] of queue.entries()) {
        if (!state.previousAccountIds.has(id) && !state.missingAccountIds.has(id)) continue

        setUncorrelatedAccount(state, id)
        const blended = setManagedAccount(state, account, addBlendHistory, skipBlendHistoryForManagedKeys)
        if (blended && onBlend) onBlend(account)
        queue.claimAccount(id, account.identityId)
    }
}

/**
 * Preserve source/nativeIdentity context for missing accounts even if they were
 * not claimed from the current work queue (e.g. still missing from previous runs).
 */
export function preserveMissingAccountContext(
    state: FusionAccountState,
    allAccountsById: Map<string, Account>
): void {
    for (const accountId of state.missingAccountIds) {
        if (state.managedAccountInfo.has(accountId)) continue
        const account = allAccountsById.get(accountId)
        if (!account?.sourceName) continue
        const parsed = parseManagedAccountKey(accountId)
        const nativeId = trimStr(account.nativeIdentity ?? parsed?.nativeIdentity) || accountId
        state.managedAccountInfo.set(accountId, {
            source: { name: account.sourceName },
            schema: { id: nativeId },
        })
    }
}

/**
 * Remove stale managed-account references when the account no longer exists.
 * This keeps accounts/missing-accounts accurate across runs and records cleanup in history.
 */
export function pruneDeletedManagedAccounts(
    state: FusionAccountState,
    allAccountsById: Map<string, Account>
): void {
    const trackedIds = new Set<string>([
        ...state.accountIds,
        ...state.missingAccountIds,
        ...state.previousAccountIds,
    ])
    let removedAnyReference = false

    for (const accountId of trackedIds) {
        if (allAccountsById.has(accountId)) continue

        const removedFromAccounts = state.accountIds.delete(accountId)
        const removedFromMissing = state.missingAccountIds.delete(accountId)
        if (removedFromAccounts || removedFromMissing) {
            removedAnyReference = true
            addHistory(state, `Removed managed account missing reference: ${accountId}`)
        }
        state.previousAccountIds.delete(accountId)
        state.managedAccountInfo.delete(accountId)
    }
    if (removedAnyReference) {
        state.needsRefresh = true
    }
}
