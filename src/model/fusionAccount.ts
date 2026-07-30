import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import {
    toSetFromAttribute as attributeToSet,
    getAccountStringAttribute,
    getAccountAttribute,
} from '../utils/attributes'
import { attrSplit } from '../services/mappingService/helpers'
import { FusionAttribute } from '../data/schema'
import { readString, trimStr } from '../utils/safeRead'
import { Attributes, ConnectorError, ConnectorErrorType, SimpleKeyType } from '@sailpoint/connector-sdk'
import { FusionDecision } from './form'
import { FusionConfig } from './config'
import { FusionMatch } from '../services/matchingService'
import { StatusEntitlement } from './statusEntitlement'
import { FusionAction } from './fusionAction'
import { FusionAccountKind } from './fusionAccountTypes'
import type { FusionAttributeBag, FusionManagedAccountInfo, IdentityInfo } from './fusionAccountTypes'
import { buildIdentityInfo } from './fusionAccountUtils'
import type { FusionRun } from './fusionRun'
import {
    buildManagedAccountKey,
    getManagedAccountKeyFromAccount,
    normalizeCompositeManagedAccountKey,
} from './managedAccountKey'
import { FusionCollections } from './fusionCollections'
import { FusionCorrelation } from './fusionCorrelation'
import { FusionLayers, type AddManagedAccountOptions } from './fusionLayers'

export const IDENTITIES_SOURCE_NAME = 'Identities'

export class FusionAccount {
    private static _config?: FusionConfig

    private _key?: SimpleKeyType
    private _managedKey?: string
    private _iscAccountId?: string
    private _email?: string
    private _name?: string
    private _sourceName = ''
    private _type: FusionAccountKind = FusionAccountKind.Fusion
    private _modified?: string
    private _identityInfo?: IdentityInfo
    private _attributeBag: FusionAttributeBag = {
        previous: {},
        current: {},
        identity: {},
        sourceAccountContexts: [],
        sources: new Map(),
    }
    private _sourceAttributeMapCache?: Map<string, Attributes[]>

    readonly collections: FusionCollections
    readonly correlation: FusionCorrelation
    readonly layers: FusionLayers

    private constructor(config?: FusionConfig) {
        const resolvedConfig = config ?? FusionAccount.ensureConfig()
        this.collections = new FusionCollections(resolvedConfig.maxHistoryMessages)
        this.correlation = new FusionCorrelation(this.collections)
        this.layers = new FusionLayers(
            this.collections,
            new Set(resolvedConfig.sources.map((sc) => sc.name)),
            resolvedConfig.fusionAccountRefreshThresholdInSeconds
        )
    }

    // ============================================================================
    // Static
    // ============================================================================

    static configure(config: FusionConfig): void {
        FusionAccount._config = config
    }

    static buildIdentityInfo(
        source: Parameters<typeof buildIdentityInfo>[0]
    ): ReturnType<typeof buildIdentityInfo> {
        return buildIdentityInfo(source)
    }

    private static ensureConfig(): FusionConfig {
        const config = FusionAccount._config
        if (!config) {
            throw new ConnectorError(
                'FusionAccount is not configured. Call FusionAccount.configure(config) before creating accounts.',
                ConnectorErrorType.Generic
            )
        }
        return config
    }

    // ============================================================================
    // Factory methods
    // ============================================================================

    private static applyAttributeCollections(fa: FusionAccount, account: Account): void {
        const statuses = attributeToSet(account.attributes!, FusionAttribute.Statuses)
        if (statuses.has(StatusEntitlement.Baseline)) {
            fa.collections._internal_sources.add(IDENTITIES_SOURCE_NAME)
        }

        fa._attributeBag.current = { ...account.attributes! }
        fa._attributeBag.previous = { ...account.attributes! }

        fa.collections._internal_missingAccountIds.clear()
        const missingAccountIds = attributeToSet(account.attributes!, FusionAttribute.MissingAccounts)
        for (const id of missingAccountIds) fa.collections._internal_missingAccountIds.add(id)

        fa.collections._clearReviews()
        const reviews = attributeToSet(account.attributes!, FusionAttribute.Reviews)
        for (const r of reviews) fa.collections._internal_reviews.add(r)

        const statusesSet = attributeToSet(account.attributes!, FusionAttribute.Statuses)
        for (const s of statusesSet) fa.collections._internal_statuses.add(s)

        const actionsSet = attributeToSet(account.attributes!, FusionAttribute.Actions)
        for (const a of actionsSet) fa.collections._internal_actions.add(a)

        const prevAccounts = attributeToSet(account.attributes!, FusionAttribute.Accounts)
        fa.collections._setPreviousAccountIds(prevAccounts)
    }

    private static applyOriginMetadata(
        fa: FusionAccount,
        account: Account,
        identityInfo: ReturnType<typeof buildIdentityInfo>
    ): void {
        const originSource = getAccountStringAttribute(account, FusionAttribute.OriginSource)
        if (originSource) fa.layers.originSource = originSource

        const originAccount = getAccountStringAttribute(account, FusionAttribute.OriginAccount)
        if (originAccount) {
            const normalizedOriginAccount = normalizeCompositeManagedAccountKey(originAccount)
            const trimmedOriginAccount = originAccount.trim()
            fa.layers.originAccount = normalizedOriginAccount ?? (trimmedOriginAccount || undefined)
        }

        const fromIdentity =
            fa.layers.originSource === IDENTITIES_SOURCE_NAME ||
            fa._attributeBag.current?.originSource === IDENTITIES_SOURCE_NAME ||
            fa._attributeBag.current?.sourceOrigin === IDENTITIES_SOURCE_NAME
        if (fromIdentity && !fa.collections.statusesSet.has(StatusEntitlement.Baseline)) {
            fa.collections._internal_statuses.add(StatusEntitlement.Baseline)
            fa.collections._internal_sources.add(IDENTITIES_SOURCE_NAME)
        }

        if (!identityInfo?.id) {
            const identityId = getAccountStringAttribute(account, FusionAttribute.IdentityId)
            if (identityId && identityId.trim().length > 0) {
                fa.setIdentityIdAttribute(identityId.trim())
            }
        }

        const historyAttr = getAccountAttribute(account, FusionAttribute.History)
        if (Array.isArray(historyAttr) && historyAttr.length > 0) {
            fa.collections.historyOps.importFromArray(historyAttr)
        }
    }

    static fromFusionAccount(account: Account): FusionAccount {
        const config = this.ensureConfig()
        const fa = new FusionAccount(config)
        const identityInfo = buildIdentityInfo(account)
        const managedKey = account.nativeIdentity as string

        fa._type = FusionAccountKind.Fusion
        fa._managedKey = managedKey
        const trimmedName = trimStr(account.name)
        if (trimmedName) fa._name = trimmedName
        if (account.sourceName) fa._sourceName = account.sourceName
        if (account.disabled !== undefined) fa.layers.disabled = account.disabled
        if (identityInfo) fa._identityInfo = identityInfo
        if (account.id != null) fa._iscAccountId = account.id
        if (account.modified !== undefined) fa._modified = account.modified
        fa.layers.isIdentity = account.uncorrelated === false

        if (account.attributes) {
            FusionAccount.applyAttributeCollections(fa, account)
            FusionAccount.applyOriginMetadata(fa, account, identityInfo)
        }

        return fa
    }

    static fromIdentity(identity: IdentityDocument): FusionAccount {
        const config = this.ensureConfig()
        const fa = new FusionAccount(config)
        const managedKey = `${IDENTITIES_SOURCE_NAME}::${identity.id}`
        const identityInfo = buildIdentityInfo(identity)

        fa._type = FusionAccountKind.Identity
        fa._managedKey = managedKey
        const trimmedName = trimStr(identity.name)
        if (trimmedName) fa._name = trimmedName
        fa._sourceName = IDENTITIES_SOURCE_NAME
        if (identity.disabled !== undefined) fa.layers.disabled = identity.disabled
        fa.layers.needsRefresh = true
        if (identityInfo) fa._identityInfo = identityInfo
        fa.layers.isIdentity = true

        fa.collections._internal_sources.add(IDENTITIES_SOURCE_NAME)

        if (identity.attributes) {
            fa._attributeBag.current = { ...identity.attributes }
            fa._attributeBag.previous = { ...identity.attributes }

            fa.collections._internal_missingAccountIds.clear()
            const missingAccountIds = attributeToSet(identity.attributes, FusionAttribute.MissingAccounts)
            for (const id of missingAccountIds) fa.collections._internal_missingAccountIds.add(id)

            fa.collections._clearReviews()
            const reviews = attributeToSet(identity.attributes, FusionAttribute.Reviews)
            for (const r of reviews) fa.collections._internal_reviews.add(r)

            const statusesSet = attributeToSet(identity.attributes, FusionAttribute.Statuses)
            for (const s of statusesSet) fa.collections._internal_statuses.add(s)

            const actionsSet = attributeToSet(identity.attributes, FusionAttribute.Actions)
            for (const a of actionsSet) fa.collections._internal_actions.add(a)
        }

        fa.layers.originSource = IDENTITIES_SOURCE_NAME
        fa.layers.originAccount = identity.id ?? undefined
        fa.collections._internal_statuses.add(StatusEntitlement.Baseline)
        fa.setIdentityIdAttribute(identity.id)
        fa.collections._internal_statuses.add(StatusEntitlement.Baseline)
        fa.collections._addHistoryEntry(
            `Set ${trimmedName || identity.name || identity.id} [${IDENTITIES_SOURCE_NAME}] as baseline`
        )

        return fa
    }

    static fromManagedAccount(account: Account): FusionAccount {
        const config = this.ensureConfig()
        const fa = new FusionAccount(config)

        const sourcesAttr = getAccountAttribute(account, FusionAttribute.Sources)
        const sourceSet = sourcesAttr ? new Set(attrSplit(String(sourcesAttr))) : new Set<string>()

        const managedAccountKey = getManagedAccountKeyFromAccount(account)
        if (!managedAccountKey) {
            throw new ConnectorError(
                'Managed account is missing sourceId and nativeIdentity; cannot build composite account key.',
                ConnectorErrorType.Generic
            )
        }
        const identityInfo = buildIdentityInfo(account)

        fa._type = FusionAccountKind.Managed
        fa._managedKey = managedAccountKey
        const trimmedName = trimStr(account.name)
        if (trimmedName) fa._name = trimmedName
        if (account.sourceName) fa._sourceName = account.sourceName
        if (account.disabled !== undefined) fa.layers.disabled = account.disabled
        fa.layers.needsRefresh = true
        if (identityInfo) fa._identityInfo = identityInfo
        if (account.id != null) fa._iscAccountId = account.id
        fa.layers.isIdentity = account.uncorrelated === false

        for (const s of sourceSet) fa.collections._internal_sources.add(s)

        if (account.attributes) {
            fa._attributeBag.current = { ...account.attributes }
            fa._attributeBag.previous = { ...account.attributes }

            fa.collections._internal_missingAccountIds.clear()
            const missingAccountIds = attributeToSet(account.attributes, FusionAttribute.MissingAccounts)
            for (const id of missingAccountIds) fa.collections._internal_missingAccountIds.add(id)

            fa.collections._clearReviews()
            const reviews = attributeToSet(account.attributes, FusionAttribute.Reviews)
            for (const r of reviews) fa.collections._internal_reviews.add(r)

            const statusesSet = attributeToSet(account.attributes, FusionAttribute.Statuses)
            for (const s of statusesSet) fa.collections._internal_statuses.add(s)

            const actionsSet = attributeToSet(account.attributes, FusionAttribute.Actions)
            for (const a of actionsSet) fa.collections._internal_actions.add(a)
        }

        fa.layers.originSource = account.sourceName ?? undefined
        fa.layers.originAccount = managedAccountKey
        fa.collections._internal_accountIds.add(managedAccountKey)
        fa.collections._internal_missingAccountIds.add(managedAccountKey)
        fa.layers.uncorrelated = true
        fa.collections._internal_statuses.add(StatusEntitlement.Uncorrelated)
        fa.collections._internal_actions.delete(FusionAction.Correlated)

        fa.layers._setManagedAccount(account, false, undefined, {
            sources: fa._attributeBag.sources,
        })

        fa.setNeedsReset(true)

        return fa
    }

    static fromFusionDecision(decision: FusionDecision): FusionAccount {
        const config = this.ensureConfig()
        const fa = new FusionAccount(config)
        const { account } = decision
        const managedAccountKey = buildManagedAccountKey({
            sourceId: readString(account, 'sourceId'),
            nativeIdentity: readString(account, 'nativeIdentity'),
        })
        if (!managedAccountKey) {
            throw new ConnectorError(
                'Fusion decision account is missing sourceId and nativeIdentity; cannot build composite account key.',
                ConnectorErrorType.Generic
            )
        }

        fa._type = FusionAccountKind.Decision
        fa._managedKey = managedAccountKey
        const trimmedName = trimStr(account.name)
        if (trimmedName) fa._name = trimmedName
        if (account.sourceName) fa._sourceName = account.sourceName
        fa.layers.needsRefresh = true
        const identityInfo = decision.identityId ? buildIdentityInfo(decision) : undefined
        if (identityInfo) fa._identityInfo = identityInfo
        fa.layers.isIdentity = (account as any).uncorrelated === false

        fa.layers.originSource = account.sourceName ?? undefined
        fa.layers.originAccount = managedAccountKey
        fa.collections._internal_accountIds.add(managedAccountKey)
        fa.collections._internal_missingAccountIds.add(managedAccountKey)
        fa.layers.uncorrelated = true
        fa.collections._internal_statuses.add(StatusEntitlement.Uncorrelated)
        fa.collections._internal_actions.delete(FusionAction.Correlated)

        return fa
    }

    // ============================================================================
    // Identity info
    // ============================================================================

    setIdentityIdAttribute(value: string | undefined): void {
        const trimmed = trimStr(value) ?? ''
        if (!this._identityInfo) {
            this._identityInfo = { id: trimmed, name: '', displayName: '' }
            return
        }
        this._identityInfo.id = trimmed
    }

    // ============================================================================
    // Basic accessors
    // ============================================================================

    get type(): FusionAccountKind {
        return this._type
    }

    get managedKey(): string | undefined {
        return this._managedKey
    }

    get managedKeyOrUndefined(): string | undefined {
        return this._managedKey
    }

    get managedAccountId(): string | undefined {
        return this._managedKey
    }

    get iscAccountId(): string | undefined {
        return this._iscAccountId
    }

    get key(): SimpleKeyType | undefined {
        return this._key
    }

    setKey(key: SimpleKeyType): void {
        this._key = key
    }

    get email(): string | undefined {
        return this._email
    }

    setEmail(email: string | undefined): void {
        this._email = email
    }

    get name(): string | undefined {
        return this._name
    }

    setName(name: string | undefined): void {
        this._name = name
    }

    get displayName(): string | undefined {
        return this._name
    }

    setDisplayName(displayName: string | undefined): void {
        this._name = displayName
    }

    get sourceName(): string {
        return this._sourceName
    }

    setSourceName(sourceName: string): void {
        this._sourceName = sourceName
    }

    get identityId(): string | undefined {
        return this._identityInfo?.id
    }

    get identityIdAttribute(): string | undefined {
        return this._identityInfo?.id
    }

    get identityInfo(): IdentityInfo | undefined {
        return this._identityInfo
    }

    get identityName(): string | undefined {
        return this._identityInfo?.name
    }

    get identityAlias(): string | undefined {
        return this._identityInfo?.displayName
    }

    get identityDisplayName(): string | undefined {
        return this._identityInfo?.displayName
    }

    get disabled(): boolean {
        return this.layers.disabled
    }

    enable(): void {
        this.layers.disabled = false
    }

    disable(): void {
        this.layers.disabled = true
    }

    get needsRefresh(): boolean {
        return this.layers.needsRefresh
    }

    get needsReset(): boolean {
        return this.layers.needsReset
    }

    setNeedsRefresh(refresh: boolean): void {
        this.layers.needsRefresh = refresh
    }

    setNeedsReset(reset: boolean): void {
        this.layers.needsReset = reset
    }

    get uncorrelated(): boolean {
        return this.layers.uncorrelated
    }

    get isManaged(): boolean {
        return this._type === FusionAccountKind.Managed
    }

    get isIdentity(): boolean {
        return this.layers.isIdentity
    }

    get fromIdentity(): boolean {
        const originFromAttributes = this._attributeBag.current?.originSource
        const legacyOriginFromAttributes = this._attributeBag.current?.sourceOrigin
        return (
            this.layers.originSource === IDENTITIES_SOURCE_NAME ||
            originFromAttributes === IDENTITIES_SOURCE_NAME ||
            legacyOriginFromAttributes === IDENTITIES_SOURCE_NAME
        )
    }

    get isMatch(): boolean {
        return this.layers.isMatch
    }

    get originSource(): string | undefined {
        return this.layers.originSource
    }

    get originAccountId(): string | undefined {
        return this.layers.originAccount
    }

    get originIdentityInScope(): boolean | undefined {
        return this.layers.originIdentityInScope
    }

    setOriginIdentityInScope(inScope: boolean): void {
        this.layers.originIdentityInScope = inScope
    }

    get modified(): string | undefined {
        return this._modified
    }

    // ============================================================================
    // Attribute accessors
    // ============================================================================

    get attributes(): Attributes {
        return this._attributeBag.current
    }

    get currentAttributes(): Attributes {
        return this._attributeBag.current
    }

    get previousAttributes(): Attributes {
        return this._attributeBag.previous
    }

    get attributeBag(): FusionAttributeBag {
        return this._attributeBag
    }

    get sourceAttributeMap(): Map<string, Attributes[]> | undefined {
        return this._sourceAttributeMapCache
    }

    getAttribute(name: string): Attributes[string] | undefined {
        return this._attributeBag.current[name]
    }

    getStringAttribute(name: string): string | undefined {
        const value = this.getAttribute(name)
        return typeof value === 'string' ? value : undefined
    }

    hasAttribute(name: string): boolean {
        return name in this._attributeBag.current
    }

    setMappedAttributes(attributes: Attributes): void {
        this._attributeBag.current = attributes
    }

    // ============================================================================
    // Layer method pass-throughs
    // ============================================================================

    addIdentityLayer(identity: IdentityDocument): void {
        this.layers.addIdentityLayer(
            identity,
            this._attributeBag,
            this._identityInfo,
            this._modified,
            (email: string) => {
                this._email = email
            },
            (info: IdentityInfo) => {
                this._identityInfo = info
            }
        )
    }

    addManagedAccountLayer(
        workQueue: FusionRun,
        options: AddManagedAccountOptions = {}
    ): void {
        this.layers.addManagedAccountLayer(
            workQueue,
            this._attributeBag,
            this._identityInfo,
            this._modified,
            this._iscAccountId,
            (id: string) => {
                this._iscAccountId = id
            },
            (name: string) => {
                this._sourceName = name
            },
            () => {
                this._sourceAttributeMapCache = undefined
            },
            options
        )
    }

    addFusionDecisionLayer(decision: FusionDecision): void {
        this.layers.addFusionDecisionLayer(decision)
    }

    // ============================================================================
    // Collection delegates
    // ============================================================================

    addAccountId(id: string, message?: string): void {
        this.collections.accounts.add(id, message)
    }

    removeAccountId(id: string, message?: string): void {
        this.collections.accounts.remove(id, message)
    }

    addMissingAccountId(id: string, message?: string): void {
        this.collections.accounts.addMissing(id, message)
    }

    removeMissingAccountId(id: string): void {
        this.collections.accounts.removeMissing(id)
    }

    get accountIds(): string[] {
        return Array.from(this.collections.accountIds)
    }

    get missingAccountIds(): string[] {
        return Array.from(this.collections.missingAccountIds)
    }

    get accountIdsSet(): ReadonlySet<string> {
        return this.collections.accountIds
    }

    get missingAccountIdsSet(): ReadonlySet<string> {
        return this.collections.missingAccountIds
    }

    /** Persisted managed-account keys from the last aggregation (`accounts` attribute). */
    get previousAccountIdsSet(): ReadonlySet<string> {
        return this.collections.previousAccountIds
    }

    get statuses(): string[] {
        return Array.from(this.collections.statusesSet)
    }

    get actions(): string[] {
        return Array.from(this.collections.actionsSet)
    }

    get reviews(): string[] {
        return Array.from(this.collections.reviewsSet)
    }

    get sources(): string[] {
        return Array.from(this.collections.sourcesSet)
    }

    get fusionMatches(): FusionMatch[] {
        return [...this.collections.fusionMatches]
    }

    get fusionMatchesRaw(): readonly FusionMatch[] {
        return this.collections.fusionMatches
    }

    get history(): string[] {
        return [...this.collections.history]
    }

    get statusesSet(): ReadonlySet<string> {
        return this.collections.statusesSet
    }

    private get previousAccountIds(): Set<string> {
        return this.collections._internal_previousAccountIds()
    }

    addStatus(status: string, message?: string): void {
        this.collections.statuses.add(status, message)
    }

    removeStatus(status: string, message?: string): void {
        this.collections.statuses.remove(status, message)
    }

    hasStatus(status: string): boolean {
        return this.collections.statuses.has(status)
    }

    setNonMatched(): void {
        this.collections.statuses.setNonMatched(this._name, this._sourceName)
    }

    addAction(action: string, message?: string): void {
        this.collections.actions.add(action, message)
    }

    removeAction(action: string, message?: string): void {
        this.collections.actions.remove(action, message)
    }

    setSourceReviewer(sourceId: string): void {
        this.collections.actions.setSourceReviewer(sourceId)
    }

    removeSourceReviewer(sourceId: string): void {
        this.collections.actions.removeSourceReviewer(sourceId)
    }

    listReviewerSources(): string[] {
        return this.collections.actions.listReviewerSources()
    }

    addReview(review: string, message?: string): void {
        this.collections.reviews.add(review, message)
    }

    removeReview(review: string, message?: string): void {
        this.collections.reviews.remove(review, message)
    }

    addFusionReview(reviewUrl: string): void {
        this.collections.reviews.addFusionReview(reviewUrl)
    }

    removeFusionReview(reviewUrl: string): void {
        this.collections.reviews.removeFusionReview(reviewUrl)
    }

    clearFusionReviews(): void {
        this.collections.reviews.clearFusionReviews()
    }

    addPendingReviewUrl(reviewUrl: string): void {
        this.collections.reviews.addPendingUrl(reviewUrl)
    }

    addReviewPromise(promise: Promise<string | undefined>): void {
        this.collections.reviews.addPromise(promise)
    }

    resolvePendingReviewUrls(): void {
        this.correlation.resolvePendingReviewUrls()
    }

    async resolvePendingOperations(awaitCorrelations = true): Promise<void> {
        await this.correlation.resolvePendingOperations(awaitCorrelations)
    }

    addSource(source: string, message?: string): void {
        this.collections.sources.add(source, message)
    }

    removeSource(source: string, message?: string): void {
        this.collections.sources.remove(source, message)
    }

    addFusionMatch(fusionMatch: FusionMatch): void {
        this.layers.addFusionMatch(fusionMatch)
    }

    clearFusionIdentityReferences(): void {
        this.layers.clearFusionIdentityReferences()
    }

    /** Drop deferred anchor rows added transiently for automatic-merge scoring on identity-match accounts. */
    removeDeferredFusionMatches(): void {
        this.layers.removeDeferredFusionMatches()
    }

    importHistory(history: string[]): void {
        this.collections.historyOps.importFromArray(history)
    }

    getManagedAccountInfo(accountId: string): FusionManagedAccountInfo | undefined {
        return this.collections.managedAccountInfo.get(accountId)
    }

    setManagedAccountInfo(accountId: string, sourceName: string, nativeIdentity: string): void {
        this.collections._internal_managedAccountInfo.set(accountId, {
            source: { name: sourceName },
            schema: { id: nativeIdentity },
        })
    }

    getMissingAccountIdsForSource(sourceName: string): string[] {
        return this.collections.accounts.getMissingForSource(sourceName)
    }

    setReverseCorrelationAttribute(attributeName: string, value: string): void {
        this._attributeBag.current[attributeName] = value
    }

    clearReverseCorrelationAttribute(attributeName: string): void {
        delete this._attributeBag.current[attributeName]
    }

    isOrphan(): boolean {
        return this.collections.statuses.isOrphan()
    }

    addFusionDecision(decision: string): void {
        this.collections.actions.addFusionDecision(decision)
    }

    removeSourceAccount(id: string): void {
        this.collections.accounts.removeSourceAccount(
            id,
            this.layers.originSource,
            this.layers.originIdentityInScope
        )
    }

    updateCorrelationStatus(onCorrelatedActionGranted?: () => void): void {
        this.correlation.updateStatus((v: boolean) => {
            this.layers.uncorrelated = v
        }, onCorrelatedActionGranted)
    }

    setCorrelatedAccount(accountId: string, promise?: Promise<unknown>): void {
        this.correlation.markCorrelated(accountId, promise)
    }

    addCorrelationPromise(_accountId: string, promise: Promise<unknown>): void {
        this.correlation.addPromise(_accountId, promise)
    }

    get correlationPromises(): Array<Promise<unknown>> {
        return [...this.correlation.promises]
    }

    get pendingReviewUrls(): string[] {
        return Array.from(this.collections.pendingReviewUrls)
    }

    // ============================================================================
    // Output
    // ============================================================================

    syncCollectionAttributesToBag(): void {
        this.collections.syncToBag(
            this._attributeBag.current,
            this.layers.originSource,
            this.layers.originAccount,
            this._identityInfo?.id
        )
    }

    toISCAccount(): any {
        return {
            attributes: this._attributeBag.current,
            disabled: this.layers.disabled,
            key: this._key,
        }
    }
}




