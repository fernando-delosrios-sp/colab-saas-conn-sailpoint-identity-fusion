import { Attributes, SimpleKeyType } from '@sailpoint/connector-sdk'
import { FusionAttribute } from '../data/schema'
import { attrConcat } from '../services/mapService/helpers'
import { FusionMatch } from '../services/matchService'
import { FusionConfig } from './config'
import { FusionAccountKind } from './fusionAccountTypes'
import type { FusionAttributeBag, FusionManagedAccountInfo, IdentityInfo } from './fusionAccountTypes'

/**
 * Plain data container for all mutable and readonly configuration state
 * associated with a {@link FusionAccount}.
 *
 * This class intentionally contains no business rules — it only holds fields
 * and the single collection-to-bag synchronization helper that operates on
 * those fields.
 */
export class FusionAccountState {
    // Core identity fields
    public type: FusionAccountKind = FusionAccountKind.Fusion
    public identityInfo?: IdentityInfo
    public managedKey?: string
    public iscAccountId?: string
    public key?: SimpleKeyType

    // Basic account information
    public email?: string
    public name?: string
    public sourceName = ''
    /** Origin source name when the fusion account was created (e.g. Identities or a managed source). */
    public originSource?: string
    /** Identity id or managed account key (sourceId::nativeIdentity) that created this fusion account (immutable). */
    public originAccount?: string
    public originIdentityInScope?: boolean

    // State flags
    public uncorrelated = false
    public isIdentity = false
    public disabled = false
    public needsRefresh = false
    public needsReset = false
    public isMatch = false

    // Collections
    public accountIds: Set<string> = new Set()
    public missingAccountIds: Set<string> = new Set()
    public statuses: Set<string> = new Set()
    public actions: Set<string> = new Set()
    public reviews: Set<string> = new Set()
    public sources: Set<string> = new Set()
    public previousAccountIds: Set<string> = new Set()
    public correlationPromises: Array<Promise<unknown>> = []
    public pendingReviewUrls: Set<string> = new Set()
    public reviewPromises: Array<Promise<string | undefined>> = []
    public fusionMatches: FusionMatch[] = []
    public history: string[] = []
    public managedAccountInfo: Map<string, FusionManagedAccountInfo> = new Map()

    // Map & Define
    // Note: previous is initialized lazily only when needed to save memory for new accounts
    public sourceAttributeMapCache?: Map<string, Attributes[]>
    public attributeBag: FusionAttributeBag = {
        previous: {},
        current: {},
        identity: {},
        sourceAccountContexts: [],
        sources: new Map(),
    }

    // Timestamps
    public modified?: string

    // Read-only configuration (set in constructor)
    /** Cached Set of configured source names for O(1) `.has()` lookups. */
    public readonly sourceConfigNamesSet: Set<string>
    public readonly fusionAccountRefreshThresholdInSeconds: number
    public readonly maxHistoryMessages: number

    constructor(config: FusionConfig) {
        this.sourceConfigNamesSet = new Set(config.sources.map((sc) => sc.name))
        this.fusionAccountRefreshThresholdInSeconds = config.fusionAccountRefreshThresholdInSeconds
        this.maxHistoryMessages = config.maxHistoryMessages
    }

    /**
     * Sync collection state (reviews, accounts, statuses, actions, etc.) into the attribute bag
     * so that getFusionAttributeSubset and downstream output include current values.
     */
    public syncCollectionAttributesToBag(): void {
        const bag = this.attributeBag.current
        bag[FusionAttribute.Reviews] = Array.from(this.reviews)
        bag[FusionAttribute.Accounts] = Array.from(this.accountIds)
        bag[FusionAttribute.Statuses] = Array.from(this.statuses)
        bag[FusionAttribute.Actions] = Array.from(this.actions)
        bag[FusionAttribute.MissingAccounts] = Array.from(this.missingAccountIds)
        bag[FusionAttribute.Sources] = attrConcat(Array.from(this.sources))
        bag[FusionAttribute.History] = [...this.history]
        if (this.originSource !== undefined) bag[FusionAttribute.OriginSource] = this.originSource
        if (this.originAccount !== undefined) bag[FusionAttribute.OriginAccount] = this.originAccount
        if (this.identityInfo?.id) bag[FusionAttribute.IdentityId] = this.identityInfo.id
    }
}
