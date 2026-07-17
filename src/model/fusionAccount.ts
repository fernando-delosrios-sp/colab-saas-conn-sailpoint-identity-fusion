import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { isNewerThan } from '../utils/date'
import {
    toSetFromAttribute as attributeToSet,
    getAccountStringAttribute,
    getAccountAttribute,
} from '../utils/attributes'
import { FusionDecision } from './form'
import { FusionConfig, SourceType } from './config'
import { FusionAttribute } from '../data/schema'
import { Attributes, ConnectorError, ConnectorErrorType, SimpleKeyType } from '@sailpoint/connector-sdk'
import { FusionMatch } from '../services/scoringService'
import { attrSplit } from '../services/attributeService/helpers'
import { FusionAccountState } from './fusionAccountState'
import { FusionAccountKind } from './fusionAccountTypes'
import type { FusionAttributeBag, FusionManagedAccountInfo, IdentityInfo } from './fusionAccountTypes'
import {
    buildManagedAccountKey,
    getManagedAccountKeyFromAccount,
    isCompositeManagedAccountKey,
    normalizeCompositeManagedAccountKey,
    parseManagedAccountKey,
} from './managedAccountKey'
import { missing, readString, trimStr } from '../utils/safeRead'
import { StatusEntitlement } from './statusEntitlement'
import { FusionAction } from './fusionAction'
import { buildIdentityInfo } from './fusionAccountUtils'
import {
    preserveMissingAccountContext,
    processIdentityMatchedAccounts,
    processPreviousRunMatchedAccounts,
    pruneDeletedManagedAccounts,
    type MatchContext,
} from './fusionAccountMatcher'

/**
 * The ISC virtual source name that represents an identity-origin fusion account.
 */
export const IDENTITIES_SOURCE_NAME = 'Identities'

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
     * Initializes scalar core fields from the factory input.
     * `type` and `managedKey` are required; everything else is optional.
     * Booleans use explicit undefined checks so `false` values are preserved.
     */
    private initializeCoreState(config: {
        type: FusionAccountKind
        managedKey: string
        name: string | null | undefined
        sourceName: string | null | undefined
        disabled?: boolean
        needsRefresh?: boolean
        identityInfo?: IdentityInfo
        iscAccountId?: string | null
        modified?: string
        isIdentity?: boolean
    }): void {
        this.state.type = config.type
        this.state.managedKey = config.managedKey
        const trimmedName = trimStr(config.name)
        if (trimmedName) this.state.name = trimmedName
        if (config.sourceName) this.state.sourceName = config.sourceName
        if (config.disabled !== undefined) this.state.disabled = config.disabled
        if (config.needsRefresh !== undefined) this.state.needsRefresh = config.needsRefresh
        if (config.identityInfo) {
            this.state.identityInfo = config.identityInfo
        }
        if (config.iscAccountId != null) this.state.iscAccountId = config.iscAccountId
        if (config.modified !== undefined) this.state.modified = config.modified
        if (config.isIdentity !== undefined) this.state.isIdentity = config.isIdentity
    }

    /**
     * Initializes the source name set from an array or existing Set.
     */
    private initializeSources(sources: string[] | Set<string> | undefined): void {
        if (!sources) return
        this.state.sources = Array.isArray(sources) ? new Set(sources) : sources
    }

    /**
     * Seeds the attribute bag and hydrates collection sets from persisted attributes.
     * Previous attributes are stored only for existing fusion accounts to save memory.
     */
    private initializeAttributeState(
        attributes: Attributes | null | undefined,
        kind: FusionAccountKind,
        managedKey?: string
    ): void {
        if (!attributes) return
        this.state.attributeBag.current = { ...attributes }
        if (kind === FusionAccountKind.Fusion && managedKey) {
            this.state.attributeBag.previous = { ...attributes }
        }
        this.initializeMissingAccountIds(attributes)
        this.initializeReviews(attributes)
        this.initializeStatuses(attributes)
        this.initializeActions(attributes)
    }

    /**
     * Hydrates the missing-account ID set from persisted attributes.
     */
    private initializeMissingAccountIds(attributes: Attributes | null | undefined): void {
        this.state.missingAccountIds = attributeToSet(attributes, FusionAttribute.MissingAccounts)
    }

    /**
     * Hydrates the review URL set from persisted attributes.
     */
    private initializeReviews(attributes: Attributes | null | undefined): void {
        this.state.reviews = attributeToSet(attributes, FusionAttribute.Reviews)
    }

    /**
     * Hydrates the status entitlement set from persisted attributes.
     */
    private initializeStatuses(attributes: Attributes | null | undefined): void {
        this.state.statuses = attributeToSet(attributes, FusionAttribute.Statuses)
    }

    /**
     * Hydrates the action set from persisted attributes.
     */
    private initializeActions(attributes: Attributes | null | undefined): void {
        this.state.actions = attributeToSet(attributes, FusionAttribute.Actions)
    }

    /**
     * Hydrates the previous account ID set from persisted attributes.
     */
    private initializePreviousAccountIds(attributes: Attributes | null | undefined): void {
        this.state.previousAccountIds = attributeToSet(attributes, FusionAttribute.Accounts)
    }

    /**
     * Derives the initial source set for a persisted fusion account.
     * Adds the virtual IDENTITIES_SOURCE_NAME source when the persisted statuses include baseline.
     */
    private static deriveBaselineSourceSet(attributes: Attributes | null | undefined): Set<string> {
        const sourceSet = new Set<string>()
        const statuses = attributeToSet(attributes, FusionAttribute.Statuses)
        if (statuses.has(StatusEntitlement.Baseline)) {
            sourceSet.add(IDENTITIES_SOURCE_NAME)
        }
        return sourceSet
    }

    /**
     * Sets the origin source and account for managed-origin creation paths.
     */
    private setOrigin(sourceName: string | null | undefined, accountId: string | null | undefined): void {
        this.state.originSource = sourceName ?? undefined
        this.state.originAccount = accountId ?? undefined
    }

    /**
     * Marks this account as identity-origin and applies the baseline status.
     * Keeps `originSource === IDENTITIES_SOURCE_NAME` and the `baseline` entitlement in sync.
     */
    private markIdentityOrigin(accountId: string | null | undefined): void {
        this.state.originSource = IDENTITIES_SOURCE_NAME
        this.state.originAccount = accountId ?? undefined
        this.setBaseline()
    }

    /**
     * Restores persisted origin metadata from an existing fusion account.
     * Also re-asserts baseline status when the restored origin is IDENTITIES_SOURCE_NAME.
     */
    private restoreOriginMetadata(account: Account): void {
        const originSource = getAccountStringAttribute(account, FusionAttribute.OriginSource)
        if (originSource) {
            this.state.originSource = originSource
        }

        const originAccount = getAccountStringAttribute(account, FusionAttribute.OriginAccount)
        if (originAccount) {
            const normalizedOriginAccount = normalizeCompositeManagedAccountKey(originAccount)
            const trimmedOriginAccount = originAccount.trim()
            this.state.originAccount = normalizedOriginAccount ?? (trimmedOriginAccount || undefined)
        }

        this.ensureBaselineForIdentityOrigin()
    }

    /**
     * Restores identity linkage from persisted attributes when the SDK Account
     * does not expose identityId directly.
     */
    private restoreIdentityLinkage(account: Account): void {
        if (this.state.identityInfo?.id) return
        const identityId = getAccountStringAttribute(account, FusionAttribute.IdentityId)
        if (identityId && identityId.trim().length > 0) {
            this.setIdentityIdAttribute(identityId.trim())
        }
    }

    /**
     * Restores persisted collection references and history.
     */
    private restorePersistedCollections(account: Account): void {
        this.initializePreviousAccountIds(account.attributes)
        const historyAttr = getAccountAttribute(account, FusionAttribute.History)
        if (Array.isArray(historyAttr) && historyAttr.length > 0) {
            this.importHistory(historyAttr)
        }
    }

    /**
     * Defensively re-asserts baseline status and Identities source for identity-origin records.
     */
    private ensureBaselineForIdentityOrigin(): void {
        if (this.fromIdentity && !this.state.statuses.has(StatusEntitlement.Baseline)) {
            this.state.statuses.add(StatusEntitlement.Baseline)
            this.state.sources.add(IDENTITIES_SOURCE_NAME)
        }
    }

    /**
     * Creates a FusionAccount from an existing fusion source account (ISC Account object).
     * Used during aggregation to reconstruct fusion accounts from the previous run.
     * Restores all persisted state including attributes, collections, history, and origin source.
     *
     * Construction sequence:
     * 1. `initializeCoreState` — scalar fields (type, managedKey, name, sourceName, disabled, identityInfo, modified, iscAccountId).
     * 2. `initializeSources` — virtual IDENTITIES_SOURCE_NAME source if persisted statuses include baseline.
     * 3. `initializeAttributeState` — current/previous attribute bags and collection sets (missing-accounts, reviews, statuses, actions).
     * 4. `restoreOriginMetadata` — persisted originSource/originAccount; re-asserts baseline for identity-origin records.
     * 5. `restoreIdentityLinkage` — identityId fallback from persisted attributes when the SDK Account does not expose it.
     * 6. `restorePersistedCollections` — previous account IDs and history import.
     *
     * @param account - The ISC Account object from the fusion source
     * @param fusionSourceId - The id of the Fusion source itself
     * @returns A fully initialized FusionAccount with restored state
     */
    public static fromFusionAccount(account: Account): FusionAccount {
        const fusionAccount = new FusionAccount()
        const identityInfo = buildIdentityInfo(account)
        const managedKey = account.nativeIdentity as string

        fusionAccount.initializeCoreState({
            type: FusionAccountKind.Fusion,
            managedKey,
            name: account.name,
            sourceName: account.sourceName,
            disabled: account.disabled,
            identityInfo,
            modified: account.modified,
            iscAccountId: account.id,
            isIdentity: account.uncorrelated === false,
        })
        fusionAccount.initializeSources(FusionAccount.deriveBaselineSourceSet(account.attributes))
        fusionAccount.initializeAttributeState(
            account.attributes,
            FusionAccountKind.Fusion,
            fusionAccount.managedKeyOrUndefined
        )
        fusionAccount.restoreOriginMetadata(account)
        fusionAccount.restoreIdentityLinkage(account)
        fusionAccount.restorePersistedCollections(account)

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
        const managedKey = `${IDENTITIES_SOURCE_NAME}::${identity.id}`
        fusionAccount.initializeCoreState({
            type: FusionAccountKind.Identity,
            managedKey,
            name: identity.name,
            sourceName: IDENTITIES_SOURCE_NAME,
            disabled: identity.disabled,
            needsRefresh: true,
            identityInfo: buildIdentityInfo(identity),
            isIdentity: true,
        })
        fusionAccount.initializeSources([IDENTITIES_SOURCE_NAME])
        fusionAccount.initializeAttributeState(identity.attributes, FusionAccountKind.Identity, managedKey)
        fusionAccount.markIdentityOrigin(identity.id)
        fusionAccount.setIdentityIdAttribute(identity.id)
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

        fusionAccount.initializeCoreState({
            type: FusionAccountKind.Managed,
            managedKey: managedAccountKey,
            name: account.name,
            sourceName: account.sourceName,
            disabled: account.disabled,
            needsRefresh: true,
            identityInfo,
            iscAccountId: account.id,
            isIdentity: account.uncorrelated === false,
        })
        fusionAccount.initializeSources(sourceSet)
        fusionAccount.initializeAttributeState(account.attributes, FusionAccountKind.Managed, managedAccountKey)
        fusionAccount.setOrigin(account.sourceName, managedAccountKey)
        fusionAccount.setUncorrelatedAccount(managedAccountKey)
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
        fusionAccount.initializeCoreState({
            type: FusionAccountKind.Decision,
            managedKey: managedAccountKey,
            name: account.name,
            sourceName: account.sourceName,
            needsRefresh: true,
            identityInfo: decision.identityId ? buildIdentityInfo(decision) : undefined,
            isIdentity: (account as any).uncorrelated === false,
        })
        fusionAccount.setOrigin(account.sourceName, managedAccountKey)
        fusionAccount.setUncorrelatedAccount(managedAccountKey)
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
        const normalizedHistory = history
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)

        const dedupedHistory: string[] = []
        for (const entry of normalizedHistory) {
            if (dedupedHistory[dedupedHistory.length - 1] !== entry) {
                dedupedHistory.push(entry)
            }
        }

        this.state.history = dedupedHistory.slice(-this.state.maxHistoryMessages)
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
        this.state.email = identity.attributes?.email as string
        this.state.identityInfo = buildIdentityInfo(identity)
        this.state.attributeBag.identity = identity.attributes ?? {}
        this.state.attributeBag.identity.name = identity.name
        this.state.isIdentity = true

        if (!this.state.needsRefresh && isNewerThan(identity.modified, this.state.modified)) {
            this.state.needsRefresh = true
        }

        for (const account of identity.accounts ?? []) {
            if (!this.state.sourceConfigNamesSet.has(account.source?.name ?? '')) continue
            const managedAccountKey = buildManagedAccountKey({
                sourceId: account.source?.id,
                nativeIdentity: readString(account, 'nativeIdentity'),
            })
            if (managedAccountKey) {
                this.setCorrelatedAccount(managedAccountKey)
            }
        }
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
        const normalizeManagedAccountKeySet = (input: Set<string>): Set<string> => {
            // ⚡ Bolt: Iterate Set directly to prevent Array.from heap allocation
            const result = new Set<string>()
            for (const key of input) {
                const normalized = normalizeCompositeManagedAccountKey(key)
                if (normalized !== undefined) {
                    result.add(normalized)
                }
            }
            return result
        }

        this.state.previousAccountIds = normalizeManagedAccountKeySet(this.state.previousAccountIds)
        this.state.missingAccountIds = normalizeManagedAccountKeySet(this.state.missingAccountIds)
        this.state.accountIds = normalizeManagedAccountKeySet(this.state.accountIds)

        const ctx: MatchContext = {
            identityId: this.identityId,
            previousAccountIds: this.state.previousAccountIds,
            missingAccountIdsSet: this.state.missingAccountIds,
            accountIdsSet: this.state.accountIds,
            setCorrelatedAccount: (id: string) => this.setCorrelatedAccount(id),
            setUncorrelatedAccount: (id: string) => this.setUncorrelatedAccount(id),
            setManagedAccount: (account: Account, addHistory: boolean, skipKeys?: ReadonlySet<string>) =>
                this.setManagedAccount(account, addHistory, skipKeys),
            hasManagedAccountInfo: (accountId: string) => this.state.managedAccountInfo.has(accountId),
            setManagedAccountInfo: (accountId: string, sourceName: string, nativeIdentity: string) =>
                this.setManagedAccountInfo(accountId, sourceName, nativeIdentity),
            deleteManagedAccountInfo: (accountId: string) => this.state.managedAccountInfo.delete(accountId),
            addHistory: (message: string) => this.addHistory(message),
            setNeedsRefresh: (refresh: boolean) => this.setNeedsRefresh(refresh),
            deleteAccountId: (id: string) => this.state.accountIds.delete(id),
            deleteMissingAccountId: (id: string) => this.state.missingAccountIds.delete(id),
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
        if (this.state.accountIds.size === 0) {
            if (this.fromIdentity) {
                const originIdentityId = this.originAccountId ?? this.identityId
                if (originIdentityId && !this.originIdentityInScope) {
                    this.state.statuses.add(StatusEntitlement.Orphan)
                    this.state.needsRefresh = false
                }
            } else {
                this.state.statuses.add(StatusEntitlement.Orphan)
                this.state.needsRefresh = false
            }
        } else {
            this.state.statuses.delete(StatusEntitlement.Orphan)
        }
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
        const managedKey = trimStr(decision.account.id) ?? ''
        if (!isCompositeManagedAccountKey(managedKey)) {
            throw new ConnectorError(
                `Fusion decision account id must be a managed account key (sourceId::nativeIdentity), received: "${managedKey || 'empty'}".`,
                ConnectorErrorType.Generic
            )
        }
        this.setUncorrelatedAccount(managedKey)
        const sourceType = decision.sourceType ?? SourceType.Authoritative

        if (decision.newIdentity) {
            if (sourceType === SourceType.Authoritative) {
                this.setManual(decision)
            }
        } else {
            this.setAuthorized(decision)
        }
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
