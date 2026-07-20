import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionDecision } from './form'
import { FusionConfig } from './config'
import { Attributes, ConnectorError, ConnectorErrorType, SimpleKeyType } from '@sailpoint/connector-sdk'
import { FusionMatch } from '../services/matchingService'
import { FusionAccountState } from './fusionAccountState'
import type { FusionManagedAccountInfo, IdentityInfo } from './fusionAccountTypes'
import { buildIdentityInfo } from './fusionAccountUtils'
import { setIdentityIdAttribute } from './fusionAccountRules/constructionRules'
import type { WorkQueue } from './fusionRun'
import {
    addFusionDecisionLayer,
    addFusionMatch,
    addIdentityLayer,
    addManagedAccountLayer,
    clearFusionIdentityReferences,
    type AddManagedAccountOptions,
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
    setCorrelatedAccount,
    updateCorrelationStatus,
} from './fusionAccountRules/correlationRules'
import {
    addAccountId,
    addMissingAccountId,
    addSource,
    getMissingAccountIdsForSource,
    removeAccountId,
    removeMissingAccountId,
    removeSource,
    removeSourceAccount,
} from './fusionAccountRules/collectionRules'
import {
    addFusionReview,
    addPendingReviewUrl,
    addReview,
    addReviewPromise,
    clearFusionReviews,
    removeFusionReview,
    removeReview,
    resolvePendingOperations,
    resolvePendingReviewUrls,
} from './fusionAccountRules/reviewRules'
import { addStatus, hasStatus, isOrphan, removeStatus, setNonMatched } from './fusionAccountRules/statusRules'
import { importHistory } from './fusionAccountRules/historyRules'

/**
 * The ISC virtual source name that represents an identity-origin fusion account.
 * Re-exported from the construction rules module so the canonical value lives with
 * the construction rules while the public API surface remains unchanged.
 */


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

export class FusionAccountBase {
    private static config?: FusionConfig

    /**
     * Sets the shared configuration for all FusionAccount instances.
     * Must be called once before any factory method is used.
     *
     * @param config - The fusion configuration
     */
    public static configure(config: FusionConfig): void {
        FusionAccountBase.config = config
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

    protected readonly state: FusionAccountState

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

    protected constructor() {
        const config = FusionAccountBase.config
        if (!config) {
            throw new ConnectorError(
                'FusionAccount is not configured. Call FusionAccount.configure(config) before creating accounts.',
                ConnectorErrorType.Generic
            )
        }
        this.state = new FusionAccountState(config)
    }

    /**
     * Sets the identity ID on `_identityInfo`, creating the bag if absent. Idempotent.
     * Non-string/empty values are stored as empty string (consistent with `buildIdentityInfo`),
     * so `hasValue(identityId)` returns false and the account is correctly treated as uncorrelated.
     */
    public setIdentityIdAttribute(value: string | undefined): void {
        setIdentityIdAttribute(this.state, value)
    }

    public setOriginIdentityInScope(inScope: boolean): void {
        this.state.originIdentityInScope = inScope
    }

    /**
     * Converts the fusion account to a standard SDK Account object for output.
     */
    public toISCAccount(): any {
        return {
            attributes: this.state.attributeBag.current,
            disabled: this.state.disabled,
            key: this.state.key,
        }
    }

    // Zero-copy read-only set accessors — use these in hot loops to avoid per-access array allocation.

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
        return getMissingAccountIdsForSource(this.state, sourceName)
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
        await resolvePendingOperations(this.state, awaitCorrelations)
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
        addFusionMatch(this.state, fusionMatch)
    }

    /**
     * Clears fusionIdentity references from matches to reduce memory retention.
     * identityId and identityName are retained for report generation.
     */
    public clearFusionIdentityReferences(): void {
        clearFusionIdentityReferences(this.state)
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
     * 1. **Identity match** (indexed): Uses the identity index to find correlated
     *    accounts in O(1) instead of scanning the full map.
     * 2. **Previous-run match** (scan): Iterates remaining accounts to find those
     *    previously associated with this fusion account (`previousAccountIds`).
     *
     * Claimed accounts are removed from the work queue via {@link WorkQueue.claim}
     * so subsequent processing phases only see unprocessed accounts.
     *
     * @param workQueue - The managed-account work queue
     * @param allAccountsById - Full snapshot of managed accounts for missing-account context
     * @param options - Matching and history options
     */
    public addManagedAccountLayer(
        workQueue: WorkQueue,
        allAccountsById?: Map<string, Account>,
        options: AddManagedAccountOptions = {}
    ): void {
        addManagedAccountLayer(
            this.state,
            workQueue,
            allAccountsById,
            options
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
     * Remove a source account and update orphan status if needed.
     */
    public removeSourceAccount(id: string): void {
        removeSourceAccount(this.state, id)
    }
}
