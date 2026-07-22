import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { Attributes, SimpleKeyType } from '@sailpoint/connector-sdk'
import type { FusionMatch } from '../services/matchingService'
import { FusionDecision } from './form'
import { FusionAccountBase } from './fusionAccountBase'
import { FusionAccountKind } from './fusionAccountTypes'
import type { FusionAttributeBag, IdentityInfo } from './fusionAccountTypes'
import {
    buildFromFusionAccount,
    buildFromFusionDecision,
    buildFromIdentity,
    buildFromManagedAccount,
    IDENTITIES_SOURCE_NAME,
} from './fusionAccountRules/constructionRules'
import { setManagedAccount as setManagedAccountLayer } from './fusionAccountRules/layerRules'

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
export class FusionAccount extends FusionAccountBase {
    /**
     * Creates a FusionAccount from an existing fusion source account (ISC Account object).
     * Used during aggregation to reconstruct fusion accounts from the previous run.
     */
    public static fromFusionAccount(account: Account): FusionAccount {
        const fusionAccount = new FusionAccount()
        buildFromFusionAccount(account, fusionAccount.state)
        return fusionAccount
    }

    /**
     * Creates a FusionAccount from an ISC identity (authoritative mode).
     * The identity becomes the baseline for the fusion account.
     */
    public static fromIdentity(identity: IdentityDocument): FusionAccount {
        const fusionAccount = new FusionAccount()
        buildFromIdentity(identity, fusionAccount.state)
        return fusionAccount
    }

    /**
     * Creates a FusionAccount from an uncorrelated managed source account.
     * Used when a source account doesn't match any existing fusion identity.
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
     */
    public static fromFusionDecision(decision: FusionDecision): FusionAccount {
        const fusionAccount = new FusionAccount()
        buildFromFusionDecision(decision, fusionAccount.state)
        return fusionAccount
    }

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

    /** The SDK simple key used for account output. Asserts non-null. */
    public get key(): SimpleKeyType | undefined {
        return this.state.key
    }

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

    /** Authoritative display label for the correlated identity behind this fusion account (alias to identityAlias). */
    public get identityDisplayName(): string | undefined {
        return this.identityAlias
    }

    /** The fusion info of the correlated identity behind this fusion account. */
    public get identityInfo(): IdentityInfo | undefined {
        return this.state.identityInfo
    }

    /** The identity name of the correlated identity behind this fusion account. */
    public get identityName(): string | undefined {
        return this.state.identityInfo?.name
    }

    /** Authoritative account name of the correlated identity (the identity alias from the SDK top-level `displayName`). */
    public get identityAlias(): string | undefined {
        return this.state.identityInfo?.displayName
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

    public get attributes(): Attributes {
        return this.state.attributeBag.current
    }

    /** Reads a value from the current attribute bag. */
    public getAttribute(name: string): Attributes[string] | undefined {
        return this.state.attributeBag.current[name]
    }

    /** Reads a string attribute from the current attribute bag. */
    public getStringAttribute(name: string): string | undefined {
        const value = this.getAttribute(name)
        return typeof value === 'string' ? value : undefined
    }

    /** Returns true when the current attribute bag contains the given name. */
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

    public get modified(): string | undefined {
        return this.state.modified
    }

    public get correlationPromises(): Array<Promise<unknown>> {
        return [...this.state.correlationPromises]
    }

    public get pendingReviewUrls(): string[] {
        return Array.from(this.state.pendingReviewUrls)
    }
}
