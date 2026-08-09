import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { trimStr } from '../utils/safeRead'
import { Attributes, ConnectorError, ConnectorErrorType, SimpleKeyType } from '@sailpoint/connector-sdk'
import { FusionDecision } from './form'
import { FusionConfig } from './config'
import { FusionMatch } from '../services/matchingService'
import { FusionAccountKind } from './fusionAccountTypes'
import type { FusionAttributeBag, IdentityInfo } from './fusionAccountTypes'
import { buildIdentityInfo } from './fusionAccountUtils'
import type { FusionRun } from './fusionRun'
import { FusionCollections } from './fusionCollections'
import { FusionCorrelation } from './fusionCorrelation'
import { FusionLayers, type AddManagedAccountOptions } from './fusionLayers'
import type { FusionAccountFactorySeed } from './fusionAccountFactorySeed'
import {
    buildFromFusionAccount,
    buildFromFusionDecision,
    buildFromIdentity,
    buildFromManagedAccount,
} from './fusionAccountFactories'

export const IDENTITIES_SOURCE_NAME = 'Identities'

/**
 * Consolidated Fusion account: owns identity fields and the attribute bag.
 * Mutable slices live on readonly collaborators — `collections`, `correlation`, and `layers`.
 * Prefer those collaborators over flat pass-through mutators for statuses, layers, and promises.
 */
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

    /** Used by fusionAccountFactories during construction. */
    static createForFactory(): FusionAccount {
        return new FusionAccount(FusionAccount.ensureConfig())
    }

    /** Seeds identity fields during factory construction. */
    applyFactorySeed(seed: FusionAccountFactorySeed): void {
        if (seed.type !== undefined) this._type = seed.type
        if (seed.managedKey !== undefined) this._managedKey = seed.managedKey
        if (seed.iscAccountId !== undefined) this._iscAccountId = seed.iscAccountId
        if (seed.modified !== undefined) this._modified = seed.modified
        if (seed.identityInfo !== undefined) this._identityInfo = seed.identityInfo
        if (seed.name) this._name = seed.name
        if (seed.sourceName) this._sourceName = seed.sourceName
        if (seed.attributeBagCurrent !== undefined) {
            this._attributeBag.current = seed.attributeBagCurrent
        }
        if (seed.attributeBagPrevious !== undefined) {
            this._attributeBag.previous = seed.attributeBagPrevious
        }
    }

    // ============================================================================
    // Factory methods
    // ============================================================================

    static fromFusionAccount(account: Account): FusionAccount {
        return buildFromFusionAccount(account)
    }

    static fromIdentity(identity: IdentityDocument): FusionAccount {
        return buildFromIdentity(identity)
    }

    static fromManagedAccount(account: Account): FusionAccount {
        return buildFromManagedAccount(account)
    }

    static fromFusionDecision(decision: FusionDecision): FusionAccount {
        return buildFromFusionDecision(decision)
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

    // ============================================================================
    // Read-only collection convenience getters
    // ============================================================================

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

    setReverseCorrelationAttribute(attributeName: string, value: string): void {
        this._attributeBag.current[attributeName] = value
    }

    clearReverseCorrelationAttribute(attributeName: string): void {
        delete this._attributeBag.current[attributeName]
    }

    /**
     * Remove a source-account reference, binding origin metadata that collections alone do not own.
     */
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





