import { AccountV2025 as Account } from 'sailpoint-api-client'
import { parseManagedAccountKey } from './managedAccountKey'
import { trimStr } from '../utils/safeRead'

export interface MatchContext {
    identityId: string | undefined
    previousAccountIds: Set<string>
    missingAccountIdsSet: ReadonlySet<string>
    accountIdsSet: ReadonlySet<string>
    setCorrelatedAccount(id: string): void
    setUncorrelatedAccount(id: string): void
    setManagedAccount(
        account: Account,
        addBlendHistory: boolean,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>
    ): boolean
    hasManagedAccountInfo(accountId: string): boolean
    setManagedAccountInfo(accountId: string, sourceName: string, nativeIdentity: string): void
    deleteManagedAccountInfo(accountId: string): void
    addHistory(message: string): void
    setNeedsRefresh(refresh: boolean): void
    deleteAccountId(id: string): boolean
    deleteMissingAccountId(id: string): boolean
}

/**
 * Identity-origin matching via index (O(1) lookup)
 */
export function processIdentityMatchedAccounts(
    ctx: MatchContext,
    accountsById: Map<string, Account>,
    accountsByIdentityId: Map<string, Set<string>>,
    addBlendHistory: boolean,
    skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
    onBlend?: (account: Account) => void
): void {
    const identityId = ctx.identityId
    if (identityId === undefined) return

    const matchedIds = accountsByIdentityId.get(identityId)
    if (!matchedIds) return

    for (const id of matchedIds) {
        const account = accountsById.get(id)
        if (account) {
            ctx.setCorrelatedAccount(id)
            const blended = ctx.setManagedAccount(account, addBlendHistory, skipBlendHistoryForManagedKeys)
            if (blended && onBlend) onBlend(account)
            accountsById.delete(id)
        }
    }
    // Clean up the index entry since all accounts for this identity have been claimed
    accountsByIdentityId.delete(identityId)
}

/**
 * Phase 2: Previous-run matching (scan remaining accounts)
 */
export function processPreviousRunMatchedAccounts(
    ctx: MatchContext,
    accountsById: Map<string, Account>,
    accountsByIdentityId: Map<string, Set<string>>,
    addBlendHistory: boolean,
    skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
    onBlend?: (account: Account) => void
): void {
    if (ctx.previousAccountIds.size === 0 && ctx.missingAccountIdsSet.size === 0) return

    for (const [id, account] of accountsById) {
        if (!ctx.previousAccountIds.has(id) && !ctx.missingAccountIdsSet.has(id)) continue

        ctx.setUncorrelatedAccount(id)
        const blended = ctx.setManagedAccount(account, addBlendHistory, skipBlendHistoryForManagedKeys)
        if (blended && onBlend) onBlend(account)
        accountsById.delete(id)

        if (!account.identityId) continue

        const idSet = accountsByIdentityId.get(account.identityId)
        if (!idSet) continue

        idSet.delete(id)
        if (idSet.size === 0) accountsByIdentityId.delete(account.identityId)
    }
}

/**
 * Preserve source/nativeIdentity context for missing accounts even if they were
 * not claimed from the current work queue (e.g. still missing from previous runs).
 */
export function preserveMissingAccountContext(ctx: MatchContext, allAccountsById: Map<string, Account>): void {
    for (const accountId of ctx.missingAccountIdsSet) {
        if (ctx.hasManagedAccountInfo(accountId)) continue
        const account = allAccountsById.get(accountId)
        if (!account?.sourceName) continue
        const parsed = parseManagedAccountKey(accountId)
        const nativeId = trimStr(account.nativeIdentity ?? parsed?.nativeIdentity) || accountId
        ctx.setManagedAccountInfo(accountId, account.sourceName, nativeId)
    }
}

/**
 * Remove stale managed-account references when the account no longer exists.
 * This keeps accounts/missing-accounts accurate across runs and records cleanup in history.
 */
export function pruneDeletedManagedAccounts(ctx: MatchContext, allAccountsById: Map<string, Account>): void {
    const trackedIds = new Set<string>([
        ...ctx.accountIdsSet,
        ...ctx.missingAccountIdsSet,
        ...ctx.previousAccountIds,
    ])
    let removedAnyReference = false

    for (const accountId of trackedIds) {
        if (allAccountsById.has(accountId)) continue

        const removedFromAccounts = ctx.deleteAccountId(accountId)
        const removedFromMissing = ctx.deleteMissingAccountId(accountId)
        if (removedFromAccounts || removedFromMissing) {
            removedAnyReference = true
            ctx.addHistory(`Removed managed account missing reference: ${accountId}`)
        }
        ctx.previousAccountIds.delete(accountId)
        ctx.deleteManagedAccountInfo(accountId)
    }
    if (removedAnyReference) {
        // Deleting managed-account references changes mapping/definition context.
        // Force a refresh so dependent attributes are recomputed in the same run.
        ctx.setNeedsRefresh(true)
    }
}
