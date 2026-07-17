import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { Attributes, ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { FusionDecision } from '../form'
import { SourceType } from '../config'
import { FusionAccountState } from '../fusionAccountState'
import { isNewerThan } from '../../utils/date'
import { readString, trimStr } from '../../utils/safeRead'
import { StatusEntitlement } from '../statusEntitlement'
import { buildIdentityInfo } from '../fusionAccountUtils'
import {
    buildManagedAccountKey,
    getManagedAccountKeyFromAccount,
    isCompositeManagedAccountKey,
    normalizeCompositeManagedAccountKey,
    parseManagedAccountKey,
} from '../managedAccountKey'
import { IDENTITIES_SOURCE_NAME } from './constructionRules'
import { addAccountId, removeMissingAccountId } from './collectionRules'
import { setUncorrelatedAccount } from './statusRules'
import { addHistory } from './historyRules'
import {
    preserveMissingAccountContext,
    processIdentityMatchedAccounts,
    processPreviousRunMatchedAccounts,
    pruneDeletedManagedAccounts,
    type MatchContext,
} from '../fusionAccountMatcher'

// ============================================================================
// Internal helpers
// ============================================================================

function normalizeHistoryLabel(value: unknown, fallback: string): string {
    return trimStr(value) ?? fallback
}

function formatHistoryAccountInfo(name: unknown, source: unknown): string {
    const accountLabel = normalizeHistoryLabel(name, 'Unknown account')
    const sourceLabel = normalizeHistoryLabel(source, 'Unknown source')
    return `${accountLabel} [${sourceLabel}]`
}

function setCorrelatedAccount(state: FusionAccountState, accountId: string): void {
    addAccountId(state, accountId)
    removeMissingAccountId(state, accountId)
}

function createDecisionHistoryMessage(decision: FusionDecision, action: string): string {
    const submitterName = normalizeHistoryLabel(
        decision.submitter.name || decision.submitter.email,
        'Unknown reviewer'
    )
    const accountInfo = formatHistoryAccountInfo(decision.account.name, decision.account.sourceName)
    const sourceType = decision.sourceType ?? SourceType.Authoritative

    if (action === 'manual') {
        return `Set ${accountInfo} as new account by ${submitterName}`
    }

    if (decision.automaticAssignment === true) {
        return `Auto-assigned ${accountInfo} to existing identity`
    }
    if (sourceType === SourceType.Record) {
        return `Assigned record ${accountInfo} to existing identity by ${submitterName}`
    }
    if (sourceType === SourceType.Orphan) {
        return `Assigned orphan account ${accountInfo} to existing identity by ${submitterName}`
    }
    return `Set ${accountInfo} as authorized by ${submitterName}`
}

function setManual(state: FusionAccountState, decision: FusionDecision): void {
    state.statuses.delete(StatusEntitlement.NonMatched)
    state.statuses.add(StatusEntitlement.Manual)
    addHistory(state, createDecisionHistoryMessage(decision, 'manual'))
}

function setAuthorized(state: FusionAccountState, decision: FusionDecision): void {
    state.statuses.delete(StatusEntitlement.NonMatched)
    if (decision.automaticAssignment === true) {
        state.statuses.add(StatusEntitlement.Auto)
    } else {
        state.statuses.add(StatusEntitlement.Authorized)
    }
    addHistory(state, createDecisionHistoryMessage(decision, 'authorized'))
}

// ============================================================================
// Layer rules
// ============================================================================

/**
 * Adds the identity layer by populating identity-sourced fields (email, name, display name)
 * and marking correlated accounts found in the identity's account list.
 */
export function addIdentityLayer(state: FusionAccountState, identity: IdentityDocument): void {
    state.email = identity.attributes?.email as string
    state.identityInfo = buildIdentityInfo(identity)
    state.attributeBag.identity = identity.attributes ?? {}
    state.attributeBag.identity.name = identity.name
    state.isIdentity = true

    if (!state.needsRefresh && isNewerThan(identity.modified, state.modified)) {
        state.needsRefresh = true
    }

    for (const account of identity.accounts ?? []) {
        if (!state.sourceConfigNamesSet.has(account.source?.name ?? '')) continue
        const managedAccountKey = buildManagedAccountKey({
            sourceId: account.source?.id,
            nativeIdentity: readString(account, 'nativeIdentity'),
        })
        if (managedAccountKey) {
            setCorrelatedAccount(state, managedAccountKey)
        }
    }
}

/**
 * Processes a single managed source account into the supplied state.
 * Triggers refresh if the account is new or recently modified and adds
 * its attributes to the source attribute layers.
 */
export function setManagedAccount(
    state: FusionAccountState,
    account: Account,
    addBlendHistory: boolean = true,
    skipBlendHistoryForManagedKeys?: ReadonlySet<string>
): boolean {
    const accountId = getManagedAccountKeyFromAccount(account)
    if (!accountId) {
        throw new ConnectorError(
            'Cannot absorb managed account without sourceId and nativeIdentity (composite key).',
            ConnectorErrorType.Generic
        )
    }
    const normalizedKey = normalizeCompositeManagedAccountKey(accountId) ?? accountId
    const skipBlendReplay =
        Boolean(skipBlendHistoryForManagedKeys?.has(normalizedKey)) ||
        Boolean(skipBlendHistoryForManagedKeys?.has(accountId))
    const recordBlendHistory = addBlendHistory && !skipBlendReplay
    const isNewAccount = !state.previousAccountIds.has(accountId)

    if (account.id) state.iscAccountId = account.id

    if (isNewAccount) {
        state.needsRefresh = true
        if (recordBlendHistory) {
            const accountLabel = trimStr(account.name ?? account.nativeIdentity ?? accountId) || accountId
            const sourceLabel = account.sourceName ?? state.sourceName
            addHistory(state, `Blended managed account ${formatHistoryAccountInfo(accountLabel, sourceLabel)}`)
        }
    }
    if (!state.needsRefresh) {
        const thresholdMs = state.fusionAccountRefreshThresholdInSeconds * 1000
        if (isNewerThan(account.modified, state.modified, thresholdMs)) {
            state.needsRefresh = true
        }
    }

    if (account.sourceName) {
        const parsedKey = parseManagedAccountKey(accountId)
        const schemaNative = trimStr(account.nativeIdentity ?? parsedKey?.nativeIdentity) || accountId
        state.managedAccountInfo.set(accountId, {
            source: { name: account.sourceName },
            schema: { id: schemaNative },
        })

        const contextAttributes = {
            ...(account.attributes ?? {}),
            name: trimStr(account.name ?? account.nativeIdentity) || accountId,
            source: {
                id: trimStr(readString(account, 'sourceId', '')) ?? '',
                name: account.sourceName ?? '',
            },
            schema: {
                name: trimStr(account.name ?? account.nativeIdentity) || accountId,
                id: schemaNative,
            },
            // IdentityIQ-style compatibility: true means account is disabled.
            IIQDisabled: Boolean(account.disabled),
        } as unknown as Attributes

        const existingSourceAccounts = state.attributeBag.sources.get(account.sourceName) || []
        existingSourceAccounts.push(contextAttributes)
        state.sources.delete(IDENTITIES_SOURCE_NAME)
        state.sources.add(account.sourceName)
        state.attributeBag.sources.set(account.sourceName, existingSourceAccounts)
        state.attributeBag.sourceAccountContexts.push(contextAttributes)
        // Invalidate cached sourceAttributeMap since sources changed
        state.sourceAttributeMapCache = undefined
    }
    return recordBlendHistory && isNewAccount
}

/**
 * Add managed account layer to the supplied state.
 *
 * Claims accounts from the shared work queue that belong to this fusion account.
 *
 * Two-phase matching:
 * 1. **Identity match** (indexed): Uses `accountsByIdentityId` to find correlated
 *    accounts in O(1) instead of scanning the full map.
 * 2. **Previous-run match** (scan): Iterates remaining accounts to find those
 *    previously associated with this fusion account (`previousAccountIds`).
 *
 * Claimed accounts are deleted from both maps so subsequent processing
 * phases (fusion → identity → managed) only see unprocessed accounts.
 */
export function addManagedAccountLayer(
    state: FusionAccountState,
    accountsById: Map<string, Account>,
    accountsByIdentityId: Map<string, Set<string>>,
    allAccountsById?: Map<string, Account>,
    pruneDeletedManagedAccountsFlag = false,
    addBlendHistory = true,
    skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
    onBlend?: (account: Account) => void
): void {
    const normalizeManagedAccountKeySet = (input: Set<string>): Set<string> => {
        // Iterate Set directly to prevent Array.from heap allocation
        const result = new Set<string>()
        for (const key of input) {
            const normalized = normalizeCompositeManagedAccountKey(key)
            if (normalized !== undefined) {
                result.add(normalized)
            }
        }
        return result
    }

    state.previousAccountIds = normalizeManagedAccountKeySet(state.previousAccountIds)
    state.missingAccountIds = normalizeManagedAccountKeySet(state.missingAccountIds)
    state.accountIds = normalizeManagedAccountKeySet(state.accountIds)

    const ctx: MatchContext = {
        identityId: state.identityInfo?.id,
        previousAccountIds: state.previousAccountIds,
        missingAccountIdsSet: state.missingAccountIds,
        accountIdsSet: state.accountIds,
        setCorrelatedAccount: (id: string) => setCorrelatedAccount(state, id),
        setUncorrelatedAccount: (id: string) => setUncorrelatedAccount(state, id),
        setManagedAccount: (account: Account, addHistory: boolean, skipKeys?: ReadonlySet<string>) =>
            setManagedAccount(state, account, addHistory, skipKeys),
        hasManagedAccountInfo: (accountId: string) => state.managedAccountInfo.has(accountId),
        setManagedAccountInfo: (accountId: string, sourceName: string, nativeIdentity: string) =>
            state.managedAccountInfo.set(accountId, {
                source: { name: sourceName },
                schema: { id: nativeIdentity },
            }),
        deleteManagedAccountInfo: (accountId: string) => state.managedAccountInfo.delete(accountId),
        addHistory: (message: string) => addHistory(state, message),
        setNeedsRefresh: (refresh: boolean) => {
            state.needsRefresh = refresh
        },
        deleteAccountId: (id: string) => state.accountIds.delete(id),
        deleteMissingAccountId: (id: string) => state.missingAccountIds.delete(id),
    }

    processIdentityMatchedAccounts(
        ctx,
        accountsById,
        accountsByIdentityId,
        addBlendHistory,
        skipBlendHistoryForManagedKeys,
        onBlend
    )
    processPreviousRunMatchedAccounts(
        ctx,
        accountsById,
        accountsByIdentityId,
        addBlendHistory,
        skipBlendHistoryForManagedKeys,
        onBlend
    )

    // Prune account references that no longer exist in the managed-account inventory.
    if (pruneDeletedManagedAccountsFlag && allAccountsById) {
        pruneDeletedManagedAccounts(ctx, allAccountsById)
    }

    if (allAccountsById) {
        preserveMissingAccountContext(ctx, allAccountsById)
    }

    // Update orphan status based on final account state
    // Managed-origin accounts are orphaned when they have no managed accounts.
    // Identity-origin accounts are orphaned when they have no managed accounts AND
    // their origin identity is not present in the configured identity scope.
    if (state.accountIds.size === 0) {
        const originFromAttributes = state.attributeBag.current?.originSource
        const legacyOriginFromAttributes = state.attributeBag.current?.sourceOrigin
        const fromIdentity =
            state.originSource === IDENTITIES_SOURCE_NAME ||
            originFromAttributes === IDENTITIES_SOURCE_NAME ||
            legacyOriginFromAttributes === IDENTITIES_SOURCE_NAME

        if (fromIdentity) {
            const originIdentityId = state.originAccount ?? state.identityInfo?.id
            if (originIdentityId && !state.originIdentityInScope) {
                state.statuses.add(StatusEntitlement.Orphan)
                state.needsRefresh = false
            }
        } else {
            state.statuses.add(StatusEntitlement.Orphan)
            state.needsRefresh = false
        }
    } else {
        state.statuses.delete(StatusEntitlement.Orphan)
    }
}

/**
 * Applies a reviewer's fusion decision to the supplied state, setting it as either
 * "manual" (new identity), "authorized" (reviewer merge into existing), or
 * "auto" (system exact-match assignment only — no `authorized` entitlement).
 *
 * Record and orphan no-match decisions are skipped: those source types never
 * yield a persisted Fusion account on no-match, so status/history is not set.
 */
export function addFusionDecisionLayer(state: FusionAccountState, decision: FusionDecision): void {
    const managedKey = trimStr(decision.account.id) ?? ''
    if (!isCompositeManagedAccountKey(managedKey)) {
        throw new ConnectorError(
            `Fusion decision account id must be a managed account key (sourceId::nativeIdentity), received: "${managedKey || 'empty'}".`,
            ConnectorErrorType.Generic
        )
    }
    setUncorrelatedAccount(state, managedKey)
    const sourceType = decision.sourceType ?? SourceType.Authoritative

    if (decision.newIdentity) {
        if (sourceType === SourceType.Authoritative) {
            setManual(state, decision)
        }
    } else {
        setAuthorized(state, decision)
    }
}
