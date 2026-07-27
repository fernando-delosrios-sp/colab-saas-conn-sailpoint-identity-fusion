import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { Attributes, ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { FusionDecision } from './form'
import { SourceType } from './config'
import { isNewerThan } from '../utils/date'
import { readString, trimStr } from '../utils/safeRead'
import { StatusEntitlement } from './statusEntitlement'
import { buildIdentityInfo } from './fusionAccountUtils'
import {
    buildManagedAccountKey,
    getManagedAccountKeyFromAccount,
    isCompositeManagedAccountKey,
    normalizeCompositeManagedAccountKey,
    parseManagedAccountKey,
} from './managedAccountKey'
import { IDENTITIES_SOURCE_NAME } from './fusionAccount'
import { FusionMatch } from '../services/matchingService'
import { getManagedAccountSnapshotKey } from '../utils/velocityAccountSnapshot'
import type { FusionCollections } from './fusionCollections'
import type { FusionRun, ManagedAccountInfo } from './fusionRun'
import type { IdentityInfo } from './fusionAccountTypes'

export interface AddManagedAccountOptions {
    pruneDeleted?: boolean
    addBlendHistory?: boolean
    skipBlendHistoryForManagedKeys?: ReadonlySet<string>
    onBlend?: (account: Account) => void
}

export class FusionLayers {
    _needsRefresh = false
    _needsReset = false
    _isIdentity = false
    _isMatch = false
    _disabled = false
    _uncorrelated = false
    _originSource?: string
    _originAccount?: string
    _originIdentityInScope?: boolean

    constructor(
        private readonly collections: FusionCollections,
        private readonly sourceConfigNamesSet: ReadonlySet<string>,
        private readonly fusionAccountRefreshThresholdInSeconds: number
    ) {}

    get needsRefresh(): boolean {
        return this._needsRefresh
    }
    set needsRefresh(v: boolean) {
        this._needsRefresh = v
    }

    get needsReset(): boolean {
        return this._needsReset
    }
    set needsReset(v: boolean) {
        this._needsReset = v
    }

    get isIdentity(): boolean {
        return this._isIdentity
    }
    set isIdentity(v: boolean) {
        this._isIdentity = v
    }

    get isMatch(): boolean {
        return this._isMatch
    }

    get disabled(): boolean {
        return this._disabled
    }
    set disabled(v: boolean) {
        this._disabled = v
    }

    get uncorrelated(): boolean {
        return this._uncorrelated
    }
    set uncorrelated(v: boolean) {
        this._uncorrelated = v
    }

    get originSource(): string | undefined {
        return this._originSource
    }
    set originSource(v: string | undefined) {
        this._originSource = v
    }

    get originAccount(): string | undefined {
        return this._originAccount
    }
    set originAccount(v: string | undefined) {
        this._originAccount = v
    }

    get originIdentityInScope(): boolean | undefined {
        return this._originIdentityInScope
    }
    set originIdentityInScope(v: boolean | undefined) {
        this._originIdentityInScope = v
    }

    // ============================================================================
    // addIdentityLayer
    // ============================================================================

    addIdentityLayer(
        identity: IdentityDocument,
        attributeBag: { identity: Attributes },
        identityInfo: IdentityInfo | undefined,
        modified?: string,
        setEmail?: (email: string) => void,
        setIdentityInfo?: (info: IdentityInfo) => void
    ): void {
        if (setEmail) setEmail(identity.attributes?.email as string)
        const builtInfo = buildIdentityInfo(identity)
        if (setIdentityInfo && builtInfo) {
            setIdentityInfo(builtInfo)
        }
        attributeBag.identity = identity.attributes ?? {}
        attributeBag.identity.name = identity.name
        this._isIdentity = true

        if (!this._needsRefresh && isNewerThan(identity.modified, modified)) {
            this._needsRefresh = true
        }

        for (const account of identity.accounts ?? []) {
            if (!this.sourceConfigNamesSet.has(account.source?.name ?? '')) continue
            const managedAccountKey = buildManagedAccountKey({
                sourceId: account.source?.id,
                nativeIdentity: readString(account, 'nativeIdentity'),
            })
            if (managedAccountKey) {
                this.collections.accounts.add(managedAccountKey)
                this.collections.accounts.removeMissing(managedAccountKey)
            }
        }
    }

    // ============================================================================
    // addManagedAccountLayer
    // ============================================================================

    addManagedAccountLayer(
        workQueue: FusionRun,
        attributeBag: { current: Attributes; sources: Map<string, Attributes[]>; sourceAccountContexts: Attributes[] },
        identityInfo: IdentityInfo | undefined,
        modified?: string,
        iscAccountId?: string,
        setIscAccountId?: (id: string) => void,
        setSourceName?: (name: string) => void,
        invalidateSourceCache?: () => void,
        options: AddManagedAccountOptions = {}
    ): void {
        const {
            pruneDeleted = false,
            addBlendHistory = true,
            skipBlendHistoryForManagedKeys,
            onBlend,
        } = options
        const normalizeManagedAccountKeySet = (input: Set<string>): Set<string> => {
            const result = new Set<string>()
            for (const key of input) {
                const normalized = normalizeCompositeManagedAccountKey(key)
                if (normalized !== undefined) {
                    result.add(normalized)
                }
            }
            return result
        }

        this.collections._setPreviousAccountIds(
            normalizeManagedAccountKeySet(new Set(this.collections.previousAccountIds))
        )
        const normMissing = normalizeManagedAccountKeySet(
            new Set(this.collections.missingAccountIds)
        )
        this.collections._internal_missingAccountIds.clear()
        for (const id of normMissing) {
            this.collections._internal_missingAccountIds.add(id)
        }
        const normAccountIds = normalizeManagedAccountKeySet(new Set(this.collections.accountIds))
        this.collections._internal_accountIds.clear()
        for (const id of normAccountIds) {
            this.collections._internal_accountIds.add(id)
        }

        this._processIdentityMatchedAccounts(workQueue, addBlendHistory, skipBlendHistoryForManagedKeys, onBlend, identityInfo?.id)
        this._processDeclaredAccountIds(
            workQueue,
            attributeBag,
            addBlendHistory,
            skipBlendHistoryForManagedKeys,
            onBlend
        )
        this._processPreviousRunMatchedAccounts(workQueue, addBlendHistory, skipBlendHistoryForManagedKeys, onBlend)

        const inventoryKeys = new Set(workQueue.managedAccountInventory.keys())

        if (pruneDeleted) {
            this._pruneDeletedManagedAccounts(inventoryKeys)
        }

        this._preserveMissingAccountContext(workQueue.managedAccountInventory)

        if (this.collections.accountIds.size === 0) {
            const originFromAttributes = attributeBag.current?.originSource
            const legacyOriginFromAttributes = attributeBag.current?.sourceOrigin
            const fromIdentity =
                this._originSource === IDENTITIES_SOURCE_NAME ||
                originFromAttributes === IDENTITIES_SOURCE_NAME ||
                legacyOriginFromAttributes === IDENTITIES_SOURCE_NAME

            if (fromIdentity) {
                const originIdentityId = this._originAccount ?? identityInfo?.id
                if (originIdentityId && !this._originIdentityInScope) {
                    this.collections._internal_statuses.add(StatusEntitlement.Orphan)
                    this._needsRefresh = false
                }
            } else {
                this.collections._internal_statuses.add(StatusEntitlement.Orphan)
                this._needsRefresh = false
            }
        } else {
            this.collections._internal_statuses.delete(StatusEntitlement.Orphan)
        }
    }

    // ============================================================================
    // addFusionDecisionLayer
    // ============================================================================

    addFusionDecisionLayer(decision: FusionDecision): void {
        const managedKey = trimStr(decision.account.id) ?? ''
        if (!isCompositeManagedAccountKey(managedKey)) {
            throw new ConnectorError(
                `Fusion decision account id must be a managed account key (sourceId::nativeIdentity), received: "${managedKey || 'empty'}".`,
                ConnectorErrorType.Generic
            )
        }
        this.collections.statuses.setUncorrelatedAccount(managedKey)
        this._uncorrelated = true
        this.collections._internal_statuses.add(StatusEntitlement.Uncorrelated)
        this.collections._internal_actions.delete('correlated')

        const sourceType = decision.sourceType ?? SourceType.Authoritative

        if (decision.newIdentity) {
            if (sourceType === SourceType.Authoritative) {
                this.collections.statuses.setManual(decision)
            }
        } else {
            this.collections.statuses.setAuthorized(decision)
        }
    }

    // ============================================================================
    // Match management
    // ============================================================================

    addFusionMatch(fusionMatch: FusionMatch): void {
        this.collections.matches.add(fusionMatch)
        this._isMatch = true
    }

    clearFusionIdentityReferences(): void {
        this.collections.matches.clearRefs()
    }

    // ============================================================================
    // Private: setManagedAccount
    // ============================================================================

    _setManagedAccount(
        account: Account,
        addBlendHistory: boolean = true,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        attributeBag?: { current: Attributes; sources: Map<string, Attributes[]> },
    ) {
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
        const isNewAccount = !this.collections.previousAccountIds.has(accountId)

        if (isNewAccount) {
            this._needsRefresh = true
            if (recordBlendHistory) {
                const accountLabel = trimStr(account.name ?? account.nativeIdentity ?? accountId) || accountId
                const sourceLabel = account.sourceName ?? ''
                this.collections._addHistoryEntry(`Blended managed account ${accountLabel} [${sourceLabel || 'Unknown source'}]`)
            }
        }
        if (!this._needsRefresh) {
            const thresholdMs = this.fusionAccountRefreshThresholdInSeconds * 1000
            if (isNewerThan(account.modified, undefined, thresholdMs)) {
                this._needsRefresh = true
            }
        }

        if (account.sourceName && attributeBag) {
            const parsedKey = parseManagedAccountKey(accountId)
            const schemaNative = trimStr(account.nativeIdentity ?? parsedKey?.nativeIdentity) || accountId
            this.collections._internal_managedAccountInfo.set(accountId, {
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
                IIQDisabled: Boolean(account.disabled),
            } as unknown as Attributes

            const existingSourceAccounts = attributeBag.sources.get(account.sourceName) || []
            existingSourceAccounts.push(contextAttributes)
            this.collections._internal_sources.delete(IDENTITIES_SOURCE_NAME)
            this.collections._internal_sources.add(account.sourceName)
            attributeBag.sources.set(account.sourceName, existingSourceAccounts)
        }
        return recordBlendHistory && isNewAccount
    }

    // ============================================================================
    // Private: Matcher functions (inlined from fusionAccountMatcher.ts)
    // ============================================================================

    private _processIdentityMatchedAccounts(
        queue: FusionRun,
        addBlendHistory: boolean,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        onBlend?: (account: Account) => void,
        identityId?: string
    ): void {
        if (identityId === undefined) return

        const matchedIds = queue.getKeysForIdentity(identityId)
        if (!matchedIds || matchedIds.size === 0) return

        for (const id of matchedIds) {
            const account = queue.get(id)
            if (account) {
                this.collections.accounts.add(id)
                this.collections.accounts.removeMissing(id)
                const blended = this._setManagedAccount(account, addBlendHistory, skipBlendHistoryForManagedKeys)
                if (blended && onBlend) onBlend(account)
                queue.claimAccount(id, account.identityId)
            }
        }
        queue.claimAccountsForIdentity(identityId)
    }

    /**
     * Blends managed accounts already listed on the fusion row (e.g. from
     * {@link addIdentityLayer} identity.accounts links) when they exist in the
     * work queue but were not reached by the identity-id index or previous-run paths.
     */
    private _processDeclaredAccountIds(
        queue: FusionRun,
        attributeBag: { sources: Map<string, Attributes[]> },
        addBlendHistory: boolean,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        onBlend?: (account: Account) => void
    ): void {
        if (this.collections.accountIds.size === 0) return

        for (const accountId of this.collections.accountIds) {
            if (this._hasSourceSnapshot(accountId, attributeBag.sources)) continue

            const account = queue.get(accountId)
            if (!account) continue

            this.collections.accounts.add(accountId)
            this.collections.accounts.removeMissing(accountId)
            const blended = this._setManagedAccount(
                account,
                addBlendHistory,
                skipBlendHistoryForManagedKeys,
                attributeBag
            )
            if (blended && onBlend) onBlend(account)
            queue.claimAccount(accountId, account.identityId)
        }
    }

    private _hasSourceSnapshot(accountId: string, sources: Map<string, Attributes[]>): boolean {
        for (const snapshots of sources.values()) {
            for (const snapshot of snapshots) {
                if (getManagedAccountSnapshotKey(snapshot) === accountId) {
                    return true
                }
            }
        }
        return false
    }

    private _processPreviousRunMatchedAccounts(
        queue: FusionRun,
        addBlendHistory: boolean,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        onBlend?: (account: Account) => void
    ): void {
        if (this.collections.previousAccountIds.size === 0 && this.collections.missingAccountIds.size === 0) return

        for (const [id, account] of queue.entries()) {
            if (!this.collections.previousAccountIds.has(id) && !this.collections.missingAccountIds.has(id))
                continue

            this.collections.statuses.setUncorrelatedAccount(id)
            this._uncorrelated = true
            this.collections._internal_statuses.add(StatusEntitlement.Uncorrelated)
            this.collections._internal_actions.delete('correlated')
            const blended = this._setManagedAccount(account, addBlendHistory, skipBlendHistoryForManagedKeys)
            if (blended && onBlend) onBlend(account)
            queue.claimAccount(id, account.identityId)
        }
    }

    private _preserveMissingAccountContext(inventory: ReadonlyMap<string, ManagedAccountInfo>): void {
        for (const accountId of this.collections.missingAccountIds) {
            if (this.collections.managedAccountInfo.has(accountId)) continue
            const info = inventory.get(accountId)
            if (!info?.sourceName) continue
            const parsed = parseManagedAccountKey(accountId)
            const nativeId = trimStr(info.nativeIdentity ?? parsed?.nativeIdentity) || accountId
            this.collections._internal_managedAccountInfo.set(accountId, {
                source: { name: info.sourceName },
                schema: { id: nativeId },
            })
        }
    }

    private _pruneDeletedManagedAccounts(inventoryKeys: ReadonlySet<string>): void {
        const trackedIds = new Set<string>([
            ...this.collections.accountIds,
            ...this.collections.missingAccountIds,
            ...this.collections.previousAccountIds,
        ])
        let removedAnyReference = false

        for (const accountId of trackedIds) {
            if (inventoryKeys.has(accountId)) continue

            const removedFromAccounts = this.collections._internal_accountIds.delete(accountId)
            const removedFromMissing = this.collections._internal_missingAccountIds.delete(accountId)
            if (removedFromAccounts || removedFromMissing) {
                removedAnyReference = true
                this.collections._addHistoryEntry(`Removed managed account missing reference: ${accountId}`)
            }
            const prev = new Set(this.collections.previousAccountIds)
            prev.delete(accountId)
            this.collections._setPreviousAccountIds(prev)
            this.collections._internal_managedAccountInfo.delete(accountId)
        }
        if (removedAnyReference) {
            this._needsRefresh = true
        }
    }
}

