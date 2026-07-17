import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { isNewerThan } from '../utils/date'
import { FusionDecision } from './form'
import { FusionConfig, SourceType } from './config'
import { Attributes, ConnectorError, ConnectorErrorType, SimpleKeyType } from '@sailpoint/connector-sdk'
import { FusionMatch } from '../services/scoringService'
import { FusionAccountState } from './fusionAccountState'
import { FusionAccountKind } from './fusionAccountTypes'
import type { FusionAttributeBag, FusionManagedAccountInfo, IdentityInfo } from './fusionAccountTypes'
import {
    getManagedAccountKeyFromAccount,
    normalizeCompositeManagedAccountKey,
    parseManagedAccountKey,
} from './managedAccountKey'
import { missing, readString, trimStr } from '../utils/safeRead'
import { StatusEntitlement } from './statusEntitlement'
import { FusionAction } from './fusionAction'
import { buildIdentityInfo } from './fusionAccountUtils'
import {
    buildFromFusionAccount,
    buildFromFusionDecision,
    buildFromIdentity,
    buildFromManagedAccount,
    IDENTITIES_SOURCE_NAME,
    importHistoryIntoState,
} from './fusionAccountRules/constructionRules'
import {
    addFusionDecisionLayer,
    addIdentityLayer,
    addManagedAccountLayer,
} from './fusionAccountRules/layerRules'

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
        fusionAccount.setBaseline()
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
        fusionAccount.setManagedAccount(account, false)
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
        this.addToSet(this.state.accountIds, id, message)
    }

    /** Removes a managed account ID from the correlated set, with optional history message. */
    public removeAccountId(id: string, message?: string): void {
        this.removeFromSet(this.state.accountIds, id, message)
    }

    /** Adds an account ID to the missing (uncorrelated) set. */
    public addMissingAccountId(id: string, message?: string): void {
        this.addToSet(this.state.missingAccountIds, id, message)
    }

    /** Removes an account ID from the missing set (i.e. it has been correlated). */
    public removeMissingAccountId(id: string, message?: string): void {
        this.removeFromSet(this.state.missingAccountIds, id, message)
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
        this.addToSet(this.state.statuses, status, message)
    }

    /** Removes a status entitlement from this fusion account. */
    public removeStatus(status: string, message?: string): void {
        this.removeFromSet(this.state.statuses, status, message)
    }

    /** Checks whether this fusion account has a given status. */
    public hasStatus(status: string): boolean {
        return this.state.statuses.has(status)
    }

    // ============================================================================
    // Mutation Methods - Actions
    // ============================================================================

    /** Adds an action entitlement to this fusion account. */
    public addAction(action: string, message?: string): void {
        this.addToSet(this.state.actions, action, message)
    }

    /** Removes an action entitlement from this fusion account. */
    public removeAction(action: string, message?: string): void {
        this.removeFromSet(this.state.actions, action, message)
    }

    /** Marks this fusion account's identity as a reviewer for the given source. */
    public setSourceReviewer(sourceId: string): void {
        this.state.actions.add(`${FusionAction.ReviewerPrefix}${sourceId}`)
        this.addStatus(StatusEntitlement.Reviewer)
    }

    /** Removes reviewer assignment for the given source and updates reviewer status when needed. */
    public removeSourceReviewer(sourceId: string): void {
        this.state.actions.delete(`${FusionAction.ReviewerPrefix}${sourceId}`)
        if (!this._actionsHasReviewerScope()) {
            this.state.statuses.delete(StatusEntitlement.Reviewer)
        }
    }

    /** Returns the source IDs this account's identity is configured to review. */
    public listReviewerSources(): string[] {
        const prefix = FusionAction.ReviewerPrefix
        // ⚡ Bolt: Iterate Set directly to prevent Array.from heap allocation
        const result: string[] = []
        for (const action of this.state.actions) {
            if (action.startsWith(prefix)) {
                result.push(action.slice(prefix.length))
            }
        }
        return result
    }

    /** True when at least one source-scoped reviewer action remains on the account. */
    private _actionsHasReviewerScope(): boolean {
        const prefix = FusionAction.ReviewerPrefix
        // ⚡ Bolt: Iterate Set directly to prevent Array.from heap allocation
        for (const action of this.state.actions) {
            if (action.startsWith(prefix)) {
                return true
            }
        }
        return false
    }

    // ============================================================================
    // Mutation Methods - Reviews
    // ============================================================================

    /** Adds a review URL to this fusion account. */
    public addReview(review: string, message?: string): void {
        this.addToSet(this.state.reviews, review, message)
    }

    /** Removes a review URL from this fusion account. */
    public removeReview(review: string, message?: string): void {
        this.removeFromSet(this.state.reviews, review, message)
    }

    /** Adds a fusion review URL and sets the "activeReviews" status. */
    public addFusionReview(reviewUrl: string): void {
        this.state.reviews.add(reviewUrl)
        this.state.statuses.add(StatusEntitlement.ActiveReviews)
    }

    /** Removes a fusion review URL. Clears "activeReviews" status if no reviews remain. */
    public removeFusionReview(reviewUrl: string): void {
        this.state.reviews.delete(reviewUrl)
        if (this.state.reviews.size === 0) {
            this.state.statuses.delete(StatusEntitlement.ActiveReviews)
        }
    }

    /**
     * Clear all fusion review URLs so they can be repopulated from the current run.
     * Used for reviewers so their reviews attribute reflects only current form instance URLs.
     */
    public clearFusionReviews(): void {
        this.state.reviews.clear()
        this.state.statuses.delete(StatusEntitlement.ActiveReviews)
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
        if (reviewUrl) {
            this.state.pendingReviewUrls.add(reviewUrl)
        }
    }

    /** Adds a promise that will resolve to a review URL once the form is created. */
    public addReviewPromise(promise: Promise<string | undefined>): void {
        if (promise) {
            this.state.reviewPromises.push(promise)
        }
    }

    /** Converts all pending review URLs into active fusion reviews. */
    public resolvePendingReviewUrls(): void {
        if (this.state.pendingReviewUrls.size === 0) return

        for (const url of this.state.pendingReviewUrls) {
            this.addFusionReview(url)
        }
        this.state.pendingReviewUrls.clear()
    }

    /**
     * Resolve all pending operations (reviews and correlations)
     * @param awaitCorrelations - When false, correlation promises are left running
     *   in the background so the caller can proceed without waiting for the queue to drain.
     */
    public async resolvePendingOperations(awaitCorrelations = true): Promise<void> {
        await this.resolveReviewPromises()
        if (awaitCorrelations) {
            await this.resolveCorrelationPromises()
        }
        this.resolvePendingReviewUrls()
    }

    /**
     * Resolve all pending review promises
     */
    private async resolveReviewPromises(): Promise<void> {
        if (this.state.reviewPromises.length === 0) return

        const reviewResults = await Promise.allSettled(this.state.reviewPromises)
        this.state.reviewPromises = []

        for (const result of reviewResults) {
            if (result.status === 'fulfilled' && result.value) {
                this.addPendingReviewUrl(result.value)
            }
        }
    }

    /**
     * Resolve all pending correlation promises
     */
    private async resolveCorrelationPromises(): Promise<void> {
        if (this.state.correlationPromises.length === 0) return

        // Wait for all correlation promises to complete
        // setCorrelatedAccount is called in the promise handlers, which updates state
        await Promise.allSettled(this.state.correlationPromises)
        this.state.correlationPromises = []
    }

    // ============================================================================
    // Mutation Methods - Sources
    // ============================================================================

    /** Adds a source name to this fusion account's source set. */
    public addSource(source: string, message?: string): void {
        this.addToSet(this.state.sources, source, message)
    }

    /** Removes a source name from this fusion account's source set. */
    public removeSource(source: string, message?: string): void {
        this.removeFromSet(this.state.sources, source, message)
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
     * Add a dated history entry
     */
    private addHistory(message: string): void {
        const normalizedMessage = trimStr(message) ?? ''
        if (missing(normalizedMessage)) return

        const now = new Date().toISOString().split('T')[0]
        const datedMessage = `[${now}] ${normalizedMessage}`
        const previousMessage = this.state.history[this.state.history.length - 1]
        if (previousMessage === datedMessage) return
        this.state.history.push(datedMessage)

        // Enforce maximum history size by keeping only the most recent entries
        if (this.state.history.length > this.state.maxHistoryMessages) {
            this.state.history = this.state.history.slice(-this.state.maxHistoryMessages)
        }
    }

    /**
     * Import history from existing account, respecting max history limit
     */
    public importHistory(history: string[]): void {
        importHistoryIntoState(this.state, history)
    }

    /**
     * Helper method to add an item to a Set and optionally log history
     */
    private addToSet<T>(set: Set<T>, item: T, message?: string): boolean {
        const initialSize = set.size
        set.add(item)
        const added = set.size > initialSize
        if (added && message) {
            this.addHistory(message)
        }
        return added
    }

    /**
     * Helper method to remove an item from a Set and optionally log history
     * @returns true if the item was removed, false otherwise
     */
    private removeFromSet<T>(set: Set<T>, item: T, message?: string): boolean {
        const removed = set.delete(item)
        if (removed && message) {
            this.addHistory(message)
        }
        return removed
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

    // ============================================================================
    // Internal Layer Helpers
    // ============================================================================

    /**
     * Processes a single managed source account into this fusion account.
     * Triggers refresh if the account is new or recently modified and adds
     * its attributes to the source attribute layers.
     *
     * ID-set membership (_accountIds / _missingAccountIds) is managed by the
     * caller (addManagedAccountLayer); this method only handles refresh logic
     * and source-attribute bookkeeping.
     *
     * @param account - The managed account to absorb
     */
    private setManagedAccount(
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
        const isNewAccount = !this.state.previousAccountIds.has(accountId)

        if (account.id) this.state.iscAccountId = account.id

        if (isNewAccount) {
            this.setNeedsRefresh(true)
            if (recordBlendHistory) {
                const accountLabel = trimStr(account.name ?? account.nativeIdentity ?? accountId) || accountId
                const sourceLabel = account.sourceName ?? this.state.sourceName
                this.addHistory(
                    `Blended managed account ${this.formatHistoryAccountInfo(accountLabel, sourceLabel)}`
                )
            }
        }
        if (!this.state.needsRefresh) {
            const thresholdMs = this.state.fusionAccountRefreshThresholdInSeconds * 1000
            if (isNewerThan(account.modified, this.state.modified, thresholdMs)) {
                this.state.needsRefresh = true
            }
        }

        if (account.sourceName) {
            const parsedKey = parseManagedAccountKey(accountId)
            const schemaNative = trimStr(account.nativeIdentity ?? parsedKey?.nativeIdentity) || accountId
            this.setManagedAccountInfo(accountId, account.sourceName, schemaNative)

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

            const existingSourceAccounts = this.state.attributeBag.sources.get(account.sourceName) || []
            existingSourceAccounts.push(contextAttributes)
            this.state.sources.delete(IDENTITIES_SOURCE_NAME)
            this.state.sources.add(account.sourceName)
            this.state.attributeBag.sources.set(account.sourceName, existingSourceAccounts)
            this.state.attributeBag.sourceAccountContexts.push(contextAttributes)
            // Invalidate cached sourceAttributeMap since sources changed
            this.state.sourceAttributeMapCache = undefined
        }
        return recordBlendHistory && isNewAccount
    }
    /** Sets whether this account's attributes need refreshing. */
    public setNeedsRefresh(refresh: boolean) {
        this.state.needsRefresh = refresh
    }

    /** Sets whether this account's generated attributes need a full reset. */
    public setNeedsReset(reset: boolean) {
        this.state.needsReset = reset
    }

    // ============================================================================
    // Status Setting Methods (private - called by factory methods and layer methods)
    // ============================================================================

    /**
     * Shared logic for setting uncorrelated status
     */
    private setUncorrelatedStatus(): void {
        this.state.uncorrelated = true
        this.state.statuses.add(StatusEntitlement.Uncorrelated)
        this.state.actions.delete(FusionAction.Correlated)
    }

    /** Sets a specific account ID as uncorrelated and adds it to both account ID sets. */
    private setUncorrelatedAccount(accountId?: string): void {
        if (!accountId) return

        this.addAccountId(accountId)
        this.addMissingAccountId(accountId)
        this.setUncorrelatedStatus()
    }

    /** Marks this account with "baseline" status (created from an identity in authoritative mode). */
    private setBaseline(): void {
        this.state.statuses.add(StatusEntitlement.Baseline)
        this.addHistory(`Set ${this.formatHistoryAccountInfo(this.name, this.state.sourceName)} as baseline`)
    }

    /** Marks this account as NonMatched (no Match found, pending review). */
    public setNonMatched(): void {
        this.state.statuses.add(StatusEntitlement.NonMatched)
        this.addHistory(`Set ${this.formatHistoryAccountInfo(this.name, this.state.sourceName)} as NonMatched`)
    }

    /**
     * Builds a history message for decision actions, varying wording by source type.
     * - authoritative manual: "new account"
     * - authoritative merge (reviewer): "authorized"
     * - authoritative merge (automaticAssignment): "Auto-assigned …"
     * - record authorized: "assigned record"
     * - orphan authorized: "assigned orphan account"
     *
     * Record/orphan manual (no-match) decisions never reach here because
     * addFusionDecisionLayer skips setManual for those source types.
     */
    private createDecisionHistoryMessage(decision: FusionDecision, action: string): string {
        const submitterName = this.normalizeHistoryLabel(
            decision.submitter.name || decision.submitter.email,
            'Unknown reviewer'
        )
        const accountInfo = this.formatHistoryAccountInfo(decision.account.name, decision.account.sourceName)
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

    /** Marks this account as "manual" (reviewer decided to create a new identity or confirmed no match). */
    private setManual(decision: FusionDecision): void {
        this.state.statuses.delete(StatusEntitlement.NonMatched)
        this.state.statuses.add(StatusEntitlement.Manual)
        const message = this.createDecisionHistoryMessage(decision, 'manual')
        this.addHistory(message)
    }

    /**
     * Marks merge-into-existing decisions: reviewer-approved adds `authorized`;
     * exact-match automatic assignment adds `auto` only (not `authorized`).
     */
    private setAuthorized(decision: FusionDecision): void {
        this.state.statuses.delete(StatusEntitlement.NonMatched)
        if (decision.automaticAssignment === true) {
            this.state.statuses.add(StatusEntitlement.Auto)
        } else {
            this.state.statuses.add(StatusEntitlement.Authorized)
        }
        const message = this.createDecisionHistoryMessage(decision, 'authorized')
        this.addHistory(message)
    }

    // ============================================================================
    // Correlation Methods
    // ============================================================================

    /**
     * Update correlation status and action based on missing accounts
     * Should be called after all layers are added to ensure correct status/action
     */
    public updateCorrelationStatus(): void {
        const hasAllAccountsCorrelated = this.state.missingAccountIds.size === 0

        if (hasAllAccountsCorrelated) {
            this.state.statuses.delete(StatusEntitlement.Uncorrelated)
            this.state.actions.add(FusionAction.Correlated)
            this.state.uncorrelated = false
        } else {
            this.state.statuses.add(StatusEntitlement.Uncorrelated)
            this.state.actions.delete(FusionAction.Correlated)
            this.state.uncorrelated = true
        }
    }

    /**
     * Marks a managed account as correlated by adding it to the account IDs set
     * and removing it from the missing set. Optionally tracks a correlation promise.
     *
     * @param accountId - The account ID that has been correlated
     * @param promise - Optional promise from the correlation API call
     */
    public setCorrelatedAccount(accountId: string, promise?: Promise<unknown>): void {
        this.addAccountId(accountId)
        this.removeMissingAccountId(accountId)
        if (promise) {
            this.addCorrelationPromise(accountId, promise)
        }
    }

    /** Tracks a correlation promise for deferred resolution during getISCAccount. */
    public addCorrelationPromise(_accountId: string, promise: Promise<unknown>): void {
        if (!promise) return

        // Track the promise - it will be resolved in getISCAccount via resolvePendingOperations
        // The promise handler (in correlateAccounts) will call setCorrelatedAccount on success
        this.state.correlationPromises.push(promise)
    }

    // ============================================================================
    // Utility Methods
    // ============================================================================

    /** Whether this account has lost all its managed source accounts. */
    public isOrphan(): boolean {
        return this.state.statuses.has(StatusEntitlement.Orphan)
    }

    /** Adds a fusion decision action entitlement with a history entry. */
    public addFusionDecision(decision: string): void {
        this.addAction(decision, `Fusion decision added: ${decision}`)
    }

    /**
     * Remove a source account and update orphan status if needed
     */
    public removeSourceAccount(id: string): void {
        this.state.accountIds.delete(id)

        if (this.state.accountIds.size === 0) {
            if (!this.fromIdentity || (this.fromIdentity && !this.originIdentityInScope)) {
                this.markAsOrphan()
                this.addHistory(`Account became orphan after removing source account: ${id}`)
            }
        }

        this.addHistory(`Source account removed: ${id}`)
    }

    private normalizeHistoryLabel(value: unknown, fallback: string): string {
        return trimStr(value) ?? fallback
    }

    private formatHistoryAccountInfo(name: unknown, source: unknown): string {
        const accountLabel = this.normalizeHistoryLabel(name, 'Unknown account')
        const sourceLabel = this.normalizeHistoryLabel(source, 'Unknown source')
        return `${accountLabel} [${sourceLabel}]`
    }

    private markAsOrphan(): void {
        this.state.statuses.add(StatusEntitlement.Orphan)
    }
}
