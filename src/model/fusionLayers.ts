import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { Attributes, ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { FusionDecision } from './form'
import { SourceType } from './config'
import { isNewerThan } from '../utils/date'
import { readString, trimStr } from '../utils/safeRead'
import { StatusEntitlement } from './statusEntitlement'
import { buildIdentityInfo, isIdentityOriginFusionAccount } from './fusionAccountUtils'
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

/**
 * Fusion account collaborator for identity / managed-account / fusion-decision enrichment
 * and layer flags (needsRefresh, disabled, origin metadata, and related).
 */
export class FusionLayers {
    private needsRefreshValue = false
    private needsResetValue = false
    private isIdentityValue = false
    private isMatchValue = false
    private disabledValue = false
    private uncorrelatedValue = false
    private originSourceValue?: string
    private originAccountValue?: string
    private originIdentityInScopeValue?: boolean

    constructor(
        private readonly collections: FusionCollections,
        private readonly sourceConfigNamesSet: ReadonlySet<string>,
        private readonly fusionAccountRefreshThresholdInSeconds: number
    ) {}

    get needsRefresh(): boolean {
        return this.needsRefreshValue
    }
    set needsRefresh(v: boolean) {
        this.needsRefreshValue = v
    }

    get needsReset(): boolean {
        return this.needsResetValue
    }
    set needsReset(v: boolean) {
        this.needsResetValue = v
    }

    get isIdentity(): boolean {
        return this.isIdentityValue
    }
    set isIdentity(v: boolean) {
        this.isIdentityValue = v
    }

    get isMatch(): boolean {
        return this.isMatchValue
    }

    get disabled(): boolean {
        return this.disabledValue
    }
    set disabled(v: boolean) {
        this.disabledValue = v
    }

    get uncorrelated(): boolean {
        return this.uncorrelatedValue
    }
    set uncorrelated(v: boolean) {
        this.uncorrelatedValue = v
    }

    get originSource(): string | undefined {
        return this.originSourceValue
    }
    set originSource(v: string | undefined) {
        this.originSourceValue = v
    }

    get originAccount(): string | undefined {
        return this.originAccountValue
    }
    set originAccount(v: string | undefined) {
        this.originAccountValue = v
    }

    get originIdentityInScope(): boolean | undefined {
        return this.originIdentityInScopeValue
    }
    set originIdentityInScope(v: boolean | undefined) {
        this.originIdentityInScopeValue = v
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
        // Identity layer enriches Velocity blending only. isIdentity (managed-source
        // correlation) is set by factory methods from source account.uncorrelated.

        if (!this.needsRefreshValue && isNewerThan(identity.modified, modified)) {
            this.needsRefreshValue = true
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

        this.collections.setPreviousAccountIds(
            normalizeManagedAccountKeySet(new Set(this.collections.previousAccountIds))
        )
        this.collections.replaceMissingAccountIds(
            normalizeManagedAccountKeySet(new Set(this.collections.missingAccountIds))
        )
        this.collections.replaceAccountIds(
            normalizeManagedAccountKeySet(new Set(this.collections.accountIds))
        )

        this.processIdentityMatchedAccounts(
            workQueue,
            attributeBag,
            addBlendHistory,
            skipBlendHistoryForManagedKeys,
            onBlend,
            identityInfo?.id
        )
        this.processDeclaredAccountIds(
            workQueue,
            attributeBag,
            addBlendHistory,
            skipBlendHistoryForManagedKeys,
            onBlend
        )
        this.processPreviousRunMatchedAccounts(
            workQueue,
            attributeBag,
            addBlendHistory,
            skipBlendHistoryForManagedKeys,
            onBlend
        )

        const inventoryKeys = new Set(workQueue.managedAccountInventory.keys())

        if (pruneDeleted) {
            this.pruneDeletedManagedAccounts(inventoryKeys)
        }

        this.preserveMissingAccountContext(workQueue.managedAccountInventory)

        if (this.collections.accountIds.size === 0) {
            const fromIdentity = isIdentityOriginFusionAccount(
                this.originSourceValue,
                attributeBag.current,
                this.collections.statusesSet.has(StatusEntitlement.Baseline)
            )

            if (fromIdentity) {
                if (this.originIdentityInScopeValue === false) {
                    this.collections.statuses.add(StatusEntitlement.Orphan)
                    this.needsRefreshValue = false
                } else if (this.originIdentityInScopeValue === true) {
                    this.collections.statuses.remove(StatusEntitlement.Orphan)
                }
            } else {
                this.collections.statuses.add(StatusEntitlement.Orphan)
                this.needsRefreshValue = false
            }
        } else {
            this.collections.statuses.remove(StatusEntitlement.Orphan)
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
        this.uncorrelatedValue = true
        this.collections.statuses.add(StatusEntitlement.Uncorrelated)
        this.collections.removeActionSilent('correlated')

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
        this.isMatchValue = true
    }

    clearFusionIdentityReferences(): void {
        this.collections.matches.clearRefs()
    }

    removeDeferredFusionMatches(): void {
        this.collections.matches.removeDeferred()
    }

    // ============================================================================
    // Private: setManagedAccount
    // ============================================================================

    setManagedAccount(
        account: Account,
        addBlendHistory: boolean = true,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        attributeBag?: { sources: Map<string, Attributes[]> },
    ) {
        const accountId = getManagedAccountKeyFromAccount(account)
        if (!accountId) {
            throw new ConnectorError(
                'Cannot absorb managed account without sourceId and nativeIdentity (composite key).',
                ConnectorErrorType.Generic
            )
        }
        const normalizedKey = accountId
        const skipBlendReplay =
            Boolean(skipBlendHistoryForManagedKeys?.has(normalizedKey)) ||
            Boolean(skipBlendHistoryForManagedKeys?.has(accountId))
        const recordBlendHistory = addBlendHistory && !skipBlendReplay
        const isNewAccount = !this.collections.previousAccountIds.has(accountId)

        if (isNewAccount) {
            this.needsRefreshValue = true
            if (recordBlendHistory) {
                const accountLabel = trimStr(account.name ?? account.nativeIdentity ?? accountId) || accountId
                const sourceLabel = account.sourceName ?? ''
                this.collections.addHistoryMessage(
                    `Blended managed account ${accountLabel} [${sourceLabel || 'Unknown source'}]`
                )
            }
        }
        if (!this.needsRefreshValue) {
            const thresholdMs = this.fusionAccountRefreshThresholdInSeconds * 1000
            if (isNewerThan(account.modified, undefined, thresholdMs)) {
                this.needsRefreshValue = true
            }
        }

        if (account.sourceName && attributeBag) {
            const parsedKey = parseManagedAccountKey(accountId)
            const schemaNative = trimStr(account.nativeIdentity ?? parsedKey?.nativeIdentity) || accountId
            this.collections.setManagedAccountInfo(accountId, {
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
            this.collections.sources.remove(IDENTITIES_SOURCE_NAME)
            this.collections.sources.add(account.sourceName)
            attributeBag.sources.set(account.sourceName, existingSourceAccounts)
        }
        return recordBlendHistory && isNewAccount
    }

    // ============================================================================
    // Private: Matcher functions (inlined from fusionAccountMatcher.ts)
    // ============================================================================

    private processIdentityMatchedAccounts(
        queue: FusionRun,
        attributeBag: { sources: Map<string, Attributes[]> },
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
                const blended = this.setManagedAccount(
                    account,
                    addBlendHistory,
                    skipBlendHistoryForManagedKeys,
                    attributeBag
                )
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
    private processDeclaredAccountIds(
        queue: FusionRun,
        attributeBag: { sources: Map<string, Attributes[]> },
        addBlendHistory: boolean,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        onBlend?: (account: Account) => void
    ): void {
        if (this.collections.accountIds.size === 0) return

        for (const accountId of this.collections.accountIds) {
            if (this.hasSourceSnapshot(accountId, attributeBag.sources)) continue

            const account = queue.get(accountId)
            if (!account) continue

            this.collections.accounts.add(accountId)
            this.collections.accounts.removeMissing(accountId)
            const blended = this.setManagedAccount(
                account,
                addBlendHistory,
                skipBlendHistoryForManagedKeys,
                attributeBag
            )
            if (blended && onBlend) onBlend(account)
            queue.claimAccount(accountId, account.identityId)
        }
    }

    private hasSourceSnapshot(accountId: string, sources: Map<string, Attributes[]>): boolean {
        for (const snapshots of sources.values()) {
            for (const snapshot of snapshots) {
                if (getManagedAccountSnapshotKey(snapshot) === accountId) {
                    return true
                }
            }
        }
        return false
    }

    private processPreviousRunMatchedAccounts(
        queue: FusionRun,
        attributeBag: { sources: Map<string, Attributes[]> },
        addBlendHistory: boolean,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        onBlend?: (account: Account) => void
    ): void {
        if (this.collections.previousAccountIds.size === 0 && this.collections.missingAccountIds.size === 0) return

        for (const [id, account] of queue.entries()) {
            if (!this.collections.previousAccountIds.has(id) && !this.collections.missingAccountIds.has(id))
                continue

            this.collections.statuses.setUncorrelatedAccount(id)
            this.uncorrelatedValue = true
            this.collections.statuses.add(StatusEntitlement.Uncorrelated)
            this.collections.removeActionSilent('correlated')
            const blended = this.setManagedAccount(
                account,
                addBlendHistory,
                skipBlendHistoryForManagedKeys,
                attributeBag
            )
            if (blended && onBlend) onBlend(account)
            queue.claimAccount(id, account.identityId)
        }
    }

    private preserveMissingAccountContext(inventory: ReadonlyMap<string, ManagedAccountInfo>): void {
        for (const accountId of this.collections.missingAccountIds) {
            if (this.collections.managedAccountInfo.has(accountId)) continue
            const info = inventory.get(accountId)
            if (!info?.sourceName) continue
            const parsed = parseManagedAccountKey(accountId)
            const nativeId = trimStr(info.nativeIdentity ?? parsed?.nativeIdentity) || accountId
            this.collections.setManagedAccountInfo(accountId, {
                source: { name: info.sourceName },
                schema: { id: nativeId },
            })
        }
    }

    private pruneDeletedManagedAccounts(inventoryKeys: ReadonlySet<string>): void {
        const trackedIds = new Set<string>([
            ...this.collections.accountIds,
            ...this.collections.missingAccountIds,
            ...this.collections.previousAccountIds,
        ])
        let removedAnyReference = false

        for (const accountId of trackedIds) {
            if (inventoryKeys.has(accountId)) continue

            const removedFromAccounts = this.collections.accounts.remove(accountId)
            const removedFromMissing = this.collections.accounts.removeMissing(accountId)
            if (removedFromAccounts || removedFromMissing) {
                removedAnyReference = true
                this.collections.addHistoryMessage(`Removed managed account missing reference: ${accountId}`)
            }
            const prev = new Set(this.collections.previousAccountIds)
            prev.delete(accountId)
            this.collections.setPreviousAccountIds(prev)
            this.collections.deleteManagedAccountInfo(accountId)
        }
        if (removedAnyReference) {
            this.needsRefreshValue = true
        }
    }
}




