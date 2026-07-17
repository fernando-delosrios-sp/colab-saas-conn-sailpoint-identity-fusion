import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionDecision } from './form'
import { FusionConfig } from './config'
import { Attributes, ConnectorError, ConnectorErrorType, SimpleKeyType } from '@sailpoint/connector-sdk'
import { FusionMatch } from '../services/scoringService'
import { FusionAccountState } from './fusionAccountState'
import { FusionAccountKind } from './fusionAccountTypes'
import type { FusionAttributeBag, FusionManagedAccountInfo, IdentityInfo } from './fusionAccountTypes'
import { trimStr } from '../utils/safeRead'
import { buildIdentityInfo } from './fusionAccountUtils'
import {
    buildFromFusionAccount,
    buildFromFusionDecision,
    buildFromIdentity,
    buildFromManagedAccount,
    IDENTITIES_SOURCE_NAME,
} from './fusionAccountRules/constructionRules'

import {
    addFusionDecisionLayer,
    addIdentityLayer,
    addManagedAccountLayer,
    setManagedAccount as setManagedAccountLayer,
} from './fusionAccountRules/layerRules'
import {
    addAction,
    addFusionDecision,
    listReviewerSources,
    removeAction,
    removeSourceReviewer,
    setSourceReviewer,
} from './fusionAccountRules/actionRules'
import {
    addCorrelationPromise,
    resolveCorrelationPromises,
    setCorrelatedAccount,
    updateCorrelationStatus,
} from './fusionAccountRules/correlationRules'
import {
    addAccountId,
    addMissingAccountId,
    addSource,
    removeAccountId,
    removeMissingAccountId,
    removeSource,
} from './fusionAccountRules/collectionRules'
import {
    addFusionReview,
    addPendingReviewUrl,
    addReview,
    addReviewPromise,
    clearFusionReviews,
    removeFusionReview,
    removeReview,
    resolvePendingReviewUrls,
    resolveReviewPromises,
} from './fusionAccountRules/reviewRules'
import { addStatus, hasStatus, isOrphan, markAsOrphan, removeStatus, setBaseline, setNonMatched } from './fusionAccountRules/statusRules'
import { addHistory, importHistory } from './fusionAccountRules/historyRules'

/**
 * The ISC virtual source name that represents an identity-origin fusion account.
 * Re-exported from the construction rules module so the canonical value lives with
 * the construction rules while the public API surface remains unchanged.
 */
export { IDENTITIES_SOURCE_NAME }

/**
 * Core domain model representing a fusion account in the Identity Fusion connector.
 *
 * A FusionAccount aggregates data from multiple sources (identity, managed accounts,
 * review decisions) into a single unified representation. It is created through factory
 * methods and enriched through a layered approach:
 *
 * 1. Factory method creates the base account (fromFusionAccount, fromIdentity, etc.)
 * 2. Identity layer adds correlated identity data
 * 3. Managed account layer processes source accounts from the work queue
 * 4. Fusion decision layer applies reviewer decisions
 *
 * The class uses a private constructor with static factory methods to enforce
 * proper initialization and ensure the static config is set before use.
 */

export class FusionAccount {
    private static config?: FusionConfig

    /**
     * Sets the shared configuration for all FusionAccount instances.
     * Must be called once before any factory method is used.
     *
     * @param config - The fusion configuration
     */
    public static configure(config: FusionConfig): void {
        FusionAccount.config = config
    }

    /**
     * Builds a unified IdentityInfo runtime object from an identity, account, or decision.
     * Exported as a static helper so callers outside the model can construct identity
     * references without importing the utility directly.
     */
    public static buildIdentityInfo(
        source: Parameters<typeof buildIdentityInfo>[0]
    ): ReturnType<typeof buildIdentityInfo> {
        return buildIdentityInfo(source)
    }

    // Private Fields - All state is encapsulated in a single data container

    // ============================================================================

    private readonly state: FusionAccountState

    // Backwards-compatibility accessors for plan 002 characterization tests that
    // inspect private fields via `as any`. These are not part of the public API.
    private get _identityInfo(): IdentityInfo | undefined {
        return this.state.identityInfo
    }

    private get previousAccountIds(): Set<string> {
        return this.state.previousAccountIds
    }

    // ============================================================================
    // Construction
    // ============================================================================

    private constructor() {
        const config = FusionAccount.config
        if (!config) {
            throw new ConnectorError(
                'FusionAccount is not configured. Call FusionAccount.configure(config) before creating accounts.',
                ConnectorErrorType.Generic
            )
        }
        this.state = new FusionAccountState(config)
    }

    // ============================================================================
    // Factory Methods - Must be first to ensure proper initialization order
    // ============================================================================

    /**
     * Creates a FusionAccount from an existing fusion source account (ISC Account object).
     * Used during aggregation to reconstruct fusion accounts from the previous run.
     * Restores all persisted state including attributes, collections, history, and origin source.
     *
     * @param account - The ISC Account object from the fusion source
     * @returns A fully initialized FusionAccount with restored state
     */
    public static fromFusionAccount(account: Account): FusionAccount {
        const fusionAccount = new FusionAccount()
        buildFromFusionAccount(account, fusionAccount.state)
        return fusionAccount
    }

    /**
     * Creates a FusionAccount from an ISC identity (authoritative mode).
     * The identity becomes the baseline for the fusion account, with its
     * attributes and correlated accounts forming the initial state.
     *
     * @param identity - The ISC identity document
     * @returns A new FusionAccount with baseline status and identity attributes
     */
    public static fromIdentity(identity: IdentityDocument): FusionAccount {
        const fusionAccount = new FusionAccount()
        buildFromIdentity(identity, fusionAccount.state)
        setBaseline(fusionAccount.state)
        return fusionAccount
    }

    /**
     * Creates a FusionAccount from an uncorrelated managed source account.
     * Used when a source account doesn't match any existing fusion identity
     * and needs to enter the Match workflow.
     *
     * @param account - The uncorrelated ISC Account from a managed source
     * @returns A new FusionAccount with uncorrelated status
     */
    public static fromManagedAccount(account: Account): FusionAccount {
        const fusionAccount = new FusionAccount()
        buildFromManagedAccount(account, fusionAccount.state)
        setManagedAccountLayer(fusionAccount.state, account, false)
        fusionAccount.setNeedsReset(true)
        return fusionAccount
    }

    /**
     * Creates a FusionAccount from a reviewer's fusion decision.
     * Used when processing form responses where a reviewer has decided
     * whether an account should create a new identity or merge with an existing one.
     *
     * @param decision - The fusion decision from the review form
     * @returns A new FusionAccount seeded from the decision's account data
     */
    public static fromFusionDecision(decision: FusionDecision): FusionAccount {
        const fusionAccount = new FusionAccount()
        buildFromFusionDecision(decision, fusionAccount.state)
        return fusionAccount
    }

    // ============================================================================
    // Accessors - Core Properties
    // ============================================================================

    /** The origin type of this fusion account (fusion, identity, managed, or decision). */
    public get type(): FusionAccountKind {
        return this.state.type
    }

    /**
     * The correlated ISC identity ID, if known.
     * Authoritative source is `_identityInfo.id`; when the SDK Account exposes the identity
     * directly, `buildIdentityInfo` populates `_identityInfo`. When the identity is restored
     * from the persisted `attributes.identityId` (the connector's own round-trip), this
     * getter returns that same value via `_identityInfo`.
     */
    public get identityId(): string | undefined {
        return this.state.identityInfo?.id
    }

    /**
     * Persisted identity ID (mirrors `attributes.identityId` in the bag).
     * Same value as the `identityId` getter — kept as a distinct accessor so callers can
     * document intent when reading the persisted attribute specifically.
     */
    public get identityIdAttribute(): string | undefined {
        return this.state.identityInfo?.id
    }

    /**
     * Sets the identity ID on `_identityInfo`, creating the bag if absent. Idempotent.
     * Non-string/empty values are stored as empty string (consistent with `buildIdentityInfo`),
     * so `hasValue(identityId)` returns false and the account is correctly treated as uncorrelated.
     */
    public setIdentityIdAttribute(value: string | undefined): void {
        const trimmed = trimStr(value) ?? ''
        if (!this.state.identityInfo) {
            this.state.identityInfo = { id: trimmed, name: '', displayName: '' }
            return
        }
        this.state.identityInfo.id = trimmed
    }

    /** The managed key (unique internal identifier) for this fusion account. Asserts non-null. */
    public get managedKey(): string {
        return this.state.managedKey!
    }

    /**
     * Safe managedKey accessor (may be undefined until key is set)
     */
    public get managedKeyOrUndefined(): string | undefined {
        return this.state.managedKey
    }

    /**
     * Managed account key (sourceId::nativeIdentity) when this fusion account represents an uncorrelated managed account.
     */
    public get managedAccountId(): string | undefined {
        return this.state.type === FusionAccountKind.Managed ? this.state.managedKey : undefined
    }

    /**
     * ISC platform account id. Available when this fusion account represents a managed account
     * that was loaded from source data. Used for building report links to the ISC UI.
     */
    public get iscAccountId(): string | undefined {
        return this.state.iscAccountId
    }

    public get originIdentityInScope(): boolean | undefined {
        return this.state.originIdentityInScope
    }

    public setOriginIdentityInScope(inScope: boolean): void {
        this.state.originIdentityInScope = inScope
    }

    /** The SDK simple key used for account output. Asserts non-null. */
    public get key(): SimpleKeyType | undefined {
        return this.state.key
    }

    // ============================================================================
    // Accessors - Account Information
    // ============================================================================

    /** Email address from the correlated identity. */
    public get email(): string | undefined {
        return this.state.email
    }

    /** Account source title (ISC Account.name). */
    public get name(): string | undefined {
        return this.state.name
    }

    /** Alias for {@link name} (fusion account title / ISC Account.name). */
    public get displayName(): string | undefined {
        return this.state.name
    }

    /** Display label for the correlated identity behind this fusion account. */
    public get identityDisplayName(): string | undefined {
        return this.state.identityInfo?.displayName
    }

    /** The fusion info of the correlated identity behind this fusion account. */
    public get identityInfo(): IdentityInfo | undefined {
        return this.state.identityInfo
    }

    /** The identity name of the correlated identity behind this fusion account. */
    public get identityName(): string | undefined {
        return this.state.identityInfo?.name
    }

    /** The fusion source name this account belongs to. */
    public get sourceName(): string {
        return this.state.sourceName
    }

    /** The original source that created this fusion account (e.g. `IDENTITIES_SOURCE_NAME` or a managed source name). */
    public get originSource(): string | undefined {
        return this.state.originSource
    }

    /** Identity id or managed account key (sourceId::nativeIdentity) that originally created this fusion account. */
    public get originAccountId(): string | undefined {
        return this.state.originAccount
    }

    // ============================================================================
    // Accessors - State Flags
    // ============================================================================

    /** Whether this account has uncorrelated (non-matched) source accounts. */
    public get uncorrelated(): boolean {
        return this.state.uncorrelated
    }

    /** Whether this is a managed account. */
    public get isManaged(): boolean {
        return this.state.type === FusionAccountKind.Managed
    }

    /** Whether this fusion account is associated to an ISC identity. */
    public get isIdentity(): boolean {
        return this.state.isIdentity
    }

    public set isIdentity(value: boolean) {
        this.state.isIdentity = value
    }

    /**
     * Whether this fusion account originated from the Identities source.
     *
     * Primary source of truth is the internal originSource field. We also fall back
     * to persisted attribute keys for backwards compatibility with older records.
     */
    public get fromIdentity(): boolean {
        const originFromAttributes = this.state.attributeBag.current?.originSource
        const legacyOriginFromAttributes = this.state.attributeBag.current?.sourceOrigin
        return (
            this.state.originSource === IDENTITIES_SOURCE_NAME ||
            originFromAttributes === IDENTITIES_SOURCE_NAME ||
            legacyOriginFromAttributes === IDENTITIES_SOURCE_NAME
        )
    }

    /** Whether this fusion account is disabled. */
    public get disabled(): boolean {
        return this.state.disabled
    }

    /** Whether this account's attributes need to be refreshed (source data changed). */
    public get needsRefresh(): boolean {
        return this.state.needsRefresh
    }

    /** Whether this account's generated attributes need a full reset. */
    public get needsReset(): boolean {
        return this.state.needsReset
    }

    /** Whether this account matched any existing fusion identity during scoring. */
    public get isMatch(): boolean {
        return this.state.isMatch
    }

    /**
     * Converts the fusion account to a standard SDK Account object for output.
     */
    public toISCAccount(): any {
        return {
            attributes: this.attributes,
            disabled: this.disabled,
            key: this.key,
        }
    }

    // ============================================================================
    // Accessors - Collections (return arrays for immutability)
    // ============================================================================

    /** IDs of correlated managed source accounts (immutable copy). */
    public get accountIds(): string[] {
        return Array.from(this.state.accountIds)
    }

    /** IDs of source accounts that are known but not yet correlated (immutable copy). */
    public get missingAccountIds(): string[] {
        return Array.from(this.state.missingAccountIds)
    }

    /** Current status entitlements (e.g. "uncorrelated", "baseline", "orphan") (immutable copy). */
    public get statuses(): string[] {
        return Array.from(this.state.statuses)
    }

    /** Current action entitlements (e.g. "report", "fusion", "correlated") (immutable copy). */
    public get actions(): string[] {
        return Array.from(this.state.actions)
    }

    /** Review URLs for active fusion review forms (immutable copy). */
    public get reviews(): string[] {
        return Array.from(this.state.reviews)
    }

    /** Source names contributing to this fusion account (immutable copy). */
    public get sources(): string[] {
        return Array.from(this.state.sources)
    }

    /** Fusion match results from Match scoring (immutable copy). */
    public get fusionMatches(): FusionMatch[] {
        return [...this.state.fusionMatches]
    }

    /** Dated audit trail of operations performed on this account (immutable copy). */
    public get history(): string[] {
        return [...this.state.history]
    }

    // Zero-copy read-only set accessors — use these in hot loops to avoid per-access array allocation.
    /** Direct reference to the correlated account IDs set (no copy). */
    public get accountIdsSet(): ReadonlySet<string> {
        return this.state.accountIds
    }

    /** Direct reference to the missing account IDs set (no copy). */
    public get missingAccountIdsSet(): ReadonlySet<string> {
        return this.state.missingAccountIds
    }

    /** Direct reference to the statuses set (no copy). */
    public get statusesSet(): ReadonlySet<string> {
        return this.state.statuses
    }

    /** Direct reference to the fusion matches array (no copy). */
    public get fusionMatchesRaw(): readonly FusionMatch[] {
        return this.state.fusionMatches
    }

    // ============================================================================
    // Accessors - Attributes
    // ============================================================================

    public get attributes(): Attributes {
        return this.state.attributeBag.current
    }

    /**
     * Reads a value from the current attribute bag.
     * Returns `undefined` when the attribute is missing or explicitly `undefined`
     * (distinguishes from `null`, which is a valid ISC attribute value).
     */
    public getAttribute(name: string): Attributes[string] | undefined {
        return this.state.attributeBag.current[name]
    }

    /**
     * Reads a string attribute from the current attribute bag.
     * Returns `undefined` when the value is not a string.
     */
    public getStringAttribute(name: string): string | undefined {
        const value = this.getAttribute(name)
        return typeof value === 'string' ? value : undefined
    }

    /**
     * Returns true when the current attribute bag contains the given name,
     * regardless of whether the value is `null` (a valid ISC attribute value).
     */
    public hasAttribute(name: string): boolean {
        return name in this.state.attributeBag.current
    }

    public get attributeBag(): FusionAttributeBag {
        return this.state.attributeBag
    }

    public get currentAttributes(): Attributes {
        return this.state.attributeBag.current
    }

    public get previousAttributes(): Attributes {
        return this.state.attributeBag.previous
    }

    /**
     * Returns a Map of source name -> attribute object list per source (cached snapshot).
     * Invalidated when sources change (via setManagedAccount).
     */
    public get sourceAttributeMap(): Map<string, Attributes[]> {
        if (!this.state.sourceAttributeMapCache) {
            const map = new Map<string, Attributes[]>()
            for (const [source, attrsArray] of this.state.attributeBag.sources.entries()) {
                map.set(source, [...attrsArray])
            }
            this.state.sourceAttributeMapCache = map
        }
        return this.state.sourceAttributeMapCache
    }

    // ============================================================================
    // Accessors - Internal State (for service layer use)
    // ============================================================================

    public get modified(): string | undefined {
        return this.state.modified
    }

    public get correlationPromises(): Array<Promise<unknown>> {
        return [...this.state.correlationPromises]
    }

    public get pendingReviewUrls(): string[] {
        return Array.from(this.state.pendingReviewUrls)
    }

    // ============================================================================
    // Setters - Core Properties
    // ============================================================================

    /** Sets the SDK output key. The managedKey is set by the factory and must not change. */
    public setKey(key: SimpleKeyType): void {
        this.state.key = key
    }

    // ============================================================================
    // Setters - Account Information
    // ============================================================================

    public setEmail(email: string | undefined): void {
        this.state.email = email
    }

    public setName(name: string | undefined): void {
        this.state.name = name
    }

    public setDisplayName(displayName: string | undefined): void {
        this.state.name = displayName
    }

    public setSourceName(sourceName: string): void {
        this.state.sourceName = sourceName
    }

    // ============================================================================
    // Setters - State Flags
    // ============================================================================

    /** Enables this fusion account (clears the disabled flag). */
    public enable(): void {
        this.state.disabled = false
    }

    /** Disables this fusion account. */
    public disable(): void {
        this.state.disabled = true
    }

    /** Replaces the current attribute bag with freshly mapped attributes. */
    public setMappedAttributes(attributes: Attributes): void {
        this.state.attributeBag.current = attributes
    }

    // ============================================================================
    // Mutation Methods - Account IDs
    // ============================================================================

    /** Adds a managed account ID to the correlated set, with optional history message. */
    public addAccountId(id: string, message?: string): void {
        addAccountId(this.state, id, message)
    }

    /** Removes a managed account ID from the correlated set, with optional history message. */
    public removeAccountId(id: string, message?: string): void {
        removeAccountId(this.state, id, message)
    }

    /** Adds an account ID to the missing (uncorrelated) set. */
    public addMissingAccountId(id: string, message?: string): void {
        addMissingAccountId(this.state, id, message)
    }

    /** Removes an account ID from the missing set (i.e. it has been correlated). */
    public removeMissingAccountId(id: string, message?: string): void {
        removeMissingAccountId(this.state, id, message)
    }

    // ============================================================================
    // Reverse Correlation Methods
    // ============================================================================

    /** Get source and native identity info for a managed account by its ID. */
    public getManagedAccountInfo(accountId: string): FusionManagedAccountInfo | undefined {
        return this.state.managedAccountInfo.get(accountId)
    }

    /** Store source and schema id (native identity) for a managed account key. */
    public setManagedAccountInfo(accountId: string, sourceName: string, nativeIdentity: string): void {
        this.state.managedAccountInfo.set(accountId, {
            source: { name: sourceName },
            schema: { id: nativeIdentity },
        })
    }

    /**
     * Returns missing account IDs that belong to a given source,
     * using the managed account info map for source lookup.
     */
    public getMissingAccountIdsForSource(sourceName: string): string[] {
        // ⚡ Bolt: Iterate Set directly to prevent Array.from heap allocation
        const result: string[] = []
        for (const id of this.state.missingAccountIds) {
            const info = this.state.managedAccountInfo.get(id)
            if (info && info.source.name === sourceName) {
                result.push(id)
            }
        }
        return result
    }

    /** Sets the dedicated reverse correlation attribute value in the attribute bag. */
    public setReverseCorrelationAttribute(attributeName: string, value: string): void {
        this.state.attributeBag.current[attributeName] = value
    }

    /** Clears the dedicated reverse correlation attribute from the attribute bag. */
    public clearReverseCorrelationAttribute(attributeName: string): void {
        delete this.state.attributeBag.current[attributeName]
    }

    // ============================================================================
    // Mutation Methods - Statuses
    // ============================================================================

    /** Adds a status entitlement to this fusion account. */
    public addStatus(status: string, message?: string): void {
        addStatus(this.state, status, message)
    }

    /** Removes a status entitlement from this fusion account. */
    public removeStatus(status: string, message?: string): void {
        removeStatus(this.state, status, message)
    }

    /** Checks whether this fusion account has a given status. */
    public hasStatus(status: string): boolean {
        return hasStatus(this.state, status)
    }

    // ============================================================================
    // Mutation Methods - Actions
    // ============================================================================

    /** Adds an action entitlement to this fusion account. */
    public addAction(action: string, message?: string): void {
        addAction(this.state, action, message)
    }

    /** Removes an action entitlement from this fusion account. */
    public removeAction(action: string, message?: string): void {
        removeAction(this.state, action, message)
    }

    /** Marks this fusion account's identity as a reviewer for the given source. */
    public setSourceReviewer(sourceId: string): void {
        setSourceReviewer(this.state, sourceId)
    }

    /** Removes reviewer assignment for the given source and updates reviewer status when needed. */
    public removeSourceReviewer(sourceId: string): void {
        removeSourceReviewer(this.state, sourceId)
    }

    /** Returns the source IDs this account's identity is configured to review. */
    public listReviewerSources(): string[] {
        return listReviewerSources(this.state)
    }

    // ============================================================================
    // Mutation Methods - Reviews
    // ============================================================================

    /** Adds a review URL to this fusion account. */
    public addReview(review: string, message?: string): void {
        addReview(this.state, review, message)
    }

    /** Removes a review URL from this fusion account. */
    public removeReview(review: string, message?: string): void {
        removeReview(this.state, review, message)
    }

    /** Adds a fusion review URL and sets the "activeReviews" status. */
    public addFusionReview(reviewUrl: string): void {
        addFusionReview(this.state, reviewUrl)
    }

    /** Removes a fusion review URL. Clears "activeReviews" status if no reviews remain. */
    public removeFusionReview(reviewUrl: string): void {
        removeFusionReview(this.state, reviewUrl)
    }

    /**
     * Clear all fusion review URLs so they can be repopulated from the current run.
     * Used for reviewers so their reviews attribute reflects only current form instance URLs.
     */
    public clearFusionReviews(): void {
        clearFusionReviews(this.state)
    }

    /**
     * Sync collection state (reviews, accounts, statuses, actions, etc.) into the attribute bag
     * so that getFusionAttributeSubset and downstream output include current values.
     */
    public syncCollectionAttributesToBag(): void {
        this.state.syncCollectionAttributesToBag()
    }

    /** Queues a review URL for deferred addition (resolved during getISCAccount). */
    public addPendingReviewUrl(reviewUrl: string): void {
        addPendingReviewUrl(this.state, reviewUrl)
    }

    /** Adds a promise that will resolve to a review URL once the form is created. */
    public addReviewPromise(promise: Promise<string | undefined>): void {
        addReviewPromise(this.state, promise)
    }

    /** Converts all pending review URLs into active fusion reviews. */
    public resolvePendingReviewUrls(): void {
        resolvePendingReviewUrls(this.state)
    }

    /**
     * Resolve all pending operations (reviews and correlations)
     * @param awaitCorrelations - When false, correlation promises are left running
     *   in the background so the caller can proceed without waiting for the queue to drain.
     */
    public async resolvePendingOperations(awaitCorrelations = true): Promise<void> {
        await resolveReviewPromises(this.state)
        if (awaitCorrelations) {
            await resolveCorrelationPromises(this.state)
        }
        resolvePendingReviewUrls(this.state)
    }

    // ============================================================================
    // Mutation Methods - Sources
    // ============================================================================

    /** Adds a source name to this fusion account's source set. */
    public addSource(source: string, message?: string): void {
        addSource(this.state, source, message)
    }

    /** Removes a source name from this fusion account's source set. */
    public removeSource(source: string, message?: string): void {
        removeSource(this.state, source, message)
    }

    // ============================================================================
    // Mutation Methods - Fusion Matches
    // ============================================================================

    /** Records a Match match result and sets the isMatch flag. */
    public addFusionMatch(fusionMatch: FusionMatch): void {
        this.state.fusionMatches.push(fusionMatch)
        this.state.isMatch = true
    }

    /**
     * Clears fusionIdentity references from matches to reduce memory retention.
     * identityId and identityName are retained for report generation.
     */
    public clearFusionIdentityReferences(): void {
        for (const match of this.state.fusionMatches) {
            ;(match as { fusionIdentity?: FusionAccount }).fusionIdentity = undefined
        }
    }

    // ============================================================================
    // Mutation Methods - History
    // ============================================================================

    /**
     * Import history from existing account, respecting max history limit
     */
    public importHistory(history: string[]): void {
        importHistory(this.state, history)
    }

    // ============================================================================
    // Layer Methods - Add data layers (must be called in order)
    // ============================================================================

    /**
     * Adds the identity layer by populating identity-sourced fields (email, name, display name)
     * and marking correlated accounts found in the identity's account list.
     *
     * @param identity - The correlated ISC identity document
     */
    public addIdentityLayer(identity: IdentityDocument): void {
        addIdentityLayer(this.state, identity)
    }

    /**
     * Add managed account layer to this fusion account.
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
     *
     * @param accountsById - Shared work queue of managed accounts
     * @param accountsByIdentityId - Secondary index: identityId → Set of account IDs
     * @param skipBlendHistoryForManagedKeys - Optional managed keys that must not get the generic
     *   "Blended managed account …" line (e.g. replay of a link-to-existing form decision in processFusionAccount).
     */
    public addManagedAccountLayer(
        accountsById: Map<string, Account>,
        accountsByIdentityId: Map<string, Set<string>>,
        allAccountsById?: Map<string, Account>,
        pruneDeletedManagedAccountsFlag = false,
        addBlendHistory = true,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        onBlend?: (account: Account) => void
    ): void {
        addManagedAccountLayer(
            this.state,
            accountsById,
            accountsByIdentityId,
            allAccountsById,
            pruneDeletedManagedAccountsFlag,
            addBlendHistory,
            skipBlendHistoryForManagedKeys,
            onBlend
        )
    }

    /**
     * Applies a reviewer's fusion decision to this account, setting it as either
     * "manual" (new identity), "authorized" (reviewer merge into existing), or
     * "auto" (system exact-match assignment only — no `authorized` entitlement).
     *
     * Record and orphan no-match decisions are skipped: those source types never
     * yield a persisted Fusion account on no-match, so status/history is not set.
     *
     * @param decision - The fusion decision from the review form
     */
    public addFusionDecisionLayer(decision: FusionDecision): void {
        addFusionDecisionLayer(this.state, decision)
    }

    /** Sets whether this account's attributes need refreshing. */
    public setNeedsRefresh(refresh: boolean) {
        this.state.needsRefresh = refresh
    }

    /** Sets whether this account's generated attributes need a full reset. */
    public setNeedsReset(reset: boolean) {
        this.state.needsReset = reset
    }

    /** Marks this account as NonMatched (no Match found, pending review). */
    public setNonMatched(): void {
        setNonMatched(this.state)
    }

    // ============================================================================
    // Correlation Methods
    // ============================================================================

    /**
     * Update correlation status and action based on missing accounts
     * Should be called after all layers are added to ensure correct status/action
     */
    public updateCorrelationStatus(): void {
        updateCorrelationStatus(this.state)
    }

    /**
     * Marks a managed account as correlated by adding it to the account IDs set
     * and removing it from the missing set. Optionally tracks a correlation promise.
     *
     * @param accountId - The account ID that has been correlated
     * @param promise - Optional promise from the correlation API call
     */
    public setCorrelatedAccount(accountId: string, promise?: Promise<unknown>): void {
        setCorrelatedAccount(this.state, accountId, promise)
    }

    /** Tracks a correlation promise for deferred resolution during getISCAccount. */
    public addCorrelationPromise(_accountId: string, promise: Promise<unknown>): void {
        addCorrelationPromise(this.state, _accountId, promise)
    }

    // ============================================================================
    // Utility Methods
    // ============================================================================

    /** Whether this account has lost all its managed source accounts. */
    public isOrphan(): boolean {
        return isOrphan(this.state)
    }

    /** Adds a fusion decision action entitlement with a history entry. */
    public addFusionDecision(decision: string): void {
        addFusionDecision(this.state, decision)
    }

    /**
     * Remove a source account and update orphan status if needed
     */
    public removeSourceAccount(id: string): void {
        removeAccountId(this.state, id)

        if (this.state.accountIds.size === 0) {
            if (!this.fromIdentity || (this.fromIdentity && !this.originIdentityInScope)) {
                markAsOrphan(this.state)
                addHistory(this.state, `Account became orphan after removing source account: ${id}`)
            }
        }

        addHistory(this.state, `Source account removed: ${id}`)
    }
}
