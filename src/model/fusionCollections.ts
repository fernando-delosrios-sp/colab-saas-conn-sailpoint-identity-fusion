import { Attributes } from '@sailpoint/connector-sdk'
import { FusionAttribute } from '../data/schema'
import { attrConcat } from '../services/mappingService/helpers'
import { FusionMatch } from '../services/matchingService'
import { missing, trimStr } from '../utils/safeRead'
import { FusionDecision } from './form'
import { SourceType } from './config'
import { FusionAction } from './fusionAction'
import { StatusEntitlement } from './statusEntitlement'
import { IDENTITIES_SOURCE_NAME } from './fusionAccount'
import type { FusionManagedAccountInfo } from './fusionAccountTypes'

export class FusionCollections {
    private _accountIds = new Set<string>()
    private _missingAccountIds = new Set<string>()
    private _statuses = new Set<string>()
    private _actions = new Set<string>()
    private _reviews = new Set<string>()
    private _sources = new Set<string>()
    private _fusionMatches: FusionMatch[] = []
    private _history: string[] = []
    private _previousAccountIds = new Set<string>()
    private _managedAccountInfo = new Map<string, FusionManagedAccountInfo>()
    private _pendingReviewUrls = new Set<string>()
    private _reviewPromises: Array<Promise<string | undefined>> = []

    constructor(private readonly maxHistoryMessages: number) {}

    // ============================================================================
    // Read-only getters
    // ============================================================================

    get accountIds(): ReadonlySet<string> {
        return this._accountIds
    }

    get missingAccountIds(): ReadonlySet<string> {
        return this._missingAccountIds
    }

    get statusesSet(): ReadonlySet<string> {
        return this._statuses
    }

    get actionsSet(): ReadonlySet<string> {
        return this._actions
    }

    get reviewsSet(): ReadonlySet<string> {
        return this._reviews
    }

    get sourcesSet(): ReadonlySet<string> {
        return this._sources
    }

    get fusionMatches(): readonly FusionMatch[] {
        return this._fusionMatches
    }

    get history(): readonly string[] {
        return this._history
    }

    get managedAccountInfo(): ReadonlyMap<string, FusionManagedAccountInfo> {
        return this._managedAccountInfo
    }

    get pendingReviewUrls(): ReadonlySet<string> {
        return this._pendingReviewUrls
    }

    get reviewPromises(): readonly Promise<string | undefined>[] {
        return this._reviewPromises
    }

    get previousAccountIds(): ReadonlySet<string> {
        return this._previousAccountIds
    }

    /** @internal */
    _setPreviousAccountIds(set: Set<string>): void {
        this._previousAccountIds = set
    }

    /** @internal */
    get _internal_missingAccountIds(): Set<string> {
        return this._missingAccountIds
    }

    /** @internal */
    get _internal_accountIds(): Set<string> {
        return this._accountIds
    }

    /** @internal */
    get _internal_statuses(): Set<string> {
        return this._statuses
    }

    /** @internal */
    get _internal_actions(): Set<string> {
        return this._actions
    }

    /** @internal */
    get _internal_managedAccountInfo(): Map<string, FusionManagedAccountInfo> {
        return this._managedAccountInfo
    }

    /** @internal */
    get _internal_sources(): Set<string> {
        return this._sources
    }

    /** @internal */
    _internal_previousAccountIds(): Set<string> {
        return this._previousAccountIds
    }

    /** @internal */
    get _internal_reviews(): Set<string> {
        return this._reviews
    }

    /** @internal */
    _clearReviews(): void {
        this._reviews.clear()
    }

    /** @internal */
    _addHistoryEntry(message: string): void {
        this._addHistory(message)
    }

    // ============================================================================
    // Private helpers
    // ============================================================================

    private _addHistory(message?: string): void {
        const normalizedMessage = trimStr(message) ?? ''
        if (missing(normalizedMessage)) return

        const now = new Date().toISOString().split('T')[0]
        const datedMessage = `[${now}] ${normalizedMessage}`
        const previousMessage = this._history[this._history.length - 1]
        if (previousMessage === datedMessage) return
        this._history.push(datedMessage)

        if (this._history.length > this.maxHistoryMessages) {
            this._history = this._history.slice(-this.maxHistoryMessages)
        }
    }

    private _normalizeHistoryLabel(value: unknown, fallback: string): string {
        return trimStr(value) ?? fallback
    }

    private _formatHistoryAccountInfo(name: unknown, source: unknown): string {
        const accountLabel = this._normalizeHistoryLabel(name, 'Unknown account')
        const sourceLabel = this._normalizeHistoryLabel(source, 'Unknown source')
        return `${accountLabel} [${sourceLabel}]`
    }

    private _createDecisionHistoryMessage(decision: FusionDecision, action: string): string {
        const submitterName = this._normalizeHistoryLabel(
            decision.submitter.name || decision.submitter.email,
            'Unknown reviewer'
        )
        const accountInfo = this._formatHistoryAccountInfo(decision.account.name, decision.account.sourceName)
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

    private _addToSet<T>(set: Set<T>, item: T, message?: string): boolean {
        const initialSize = set.size
        set.add(item)
        const added = set.size > initialSize
        if (added && message) {
            this._addHistory(message)
        }
        return added
    }

    private _removeFromSet<T>(set: Set<T>, item: T, message?: string): boolean {
        const removed = set.delete(item)
        if (removed && message) {
            this._addHistory(message)
        }
        return removed
    }

    // ============================================================================
    // Public namespaced operations
    // ============================================================================

    readonly accounts = {
        add: (id: string, message?: string): void => {
            this._addToSet(this._accountIds, id, message)
        },
        remove: (id: string, message?: string): void => {
            this._removeFromSet(this._accountIds, id, message)
        },
        addMissing: (id: string, message?: string): void => {
            this._addToSet(this._missingAccountIds, id, message)
        },
        removeMissing: (id: string, message?: string): void => {
            this._removeFromSet(this._missingAccountIds, id, message)
        },
        getMissingForSource: (sourceName: string): string[] => {
            const result: string[] = []
            for (const id of this._missingAccountIds) {
                const info = this._managedAccountInfo.get(id)
                if (info && info.source.name === sourceName) {
                    result.push(id)
                }
            }
            return result
        },
        removeSourceAccount: (id: string, originSource?: string, originIdentityInScope?: boolean): void => {
            this._removeFromSet(this._accountIds, id, '')

            const fromIdentity = originSource === IDENTITIES_SOURCE_NAME

            if (this._accountIds.size === 0) {
                if (!fromIdentity || (fromIdentity && !originIdentityInScope)) {
                    this._statuses.add(StatusEntitlement.Orphan)
                    this._addHistory(`Account became orphan after removing source account: ${id}`)
                }
            }

            this._addHistory(`Source account removed: ${id}`)
        },
    }

    readonly statuses = {
        add: (status: string, message?: string): void => {
            this._addToSet(this._statuses, status, message)
        },
        remove: (status: string, message?: string): void => {
            this._removeFromSet(this._statuses, status, message)
        },
        has: (status: string): boolean => {
            return this._statuses.has(status)
        },
        setNonMatched: (actorName?: string, sourceName?: string): void => {
            this._statuses.add(StatusEntitlement.NonMatched)
            this._addHistory(
                `Set ${this._formatHistoryAccountInfo(actorName, sourceName)} as NonMatched`
            )
        },
        setUncorrelatedAccount: (accountId: string): void => {
            if (!accountId) return
            this.accounts.add(accountId)
            this.accounts.addMissing(accountId)
            this._statuses.add(StatusEntitlement.Uncorrelated)
            this._actions.delete(FusionAction.Correlated)
        },
        isOrphan: (): boolean => {
            return this._statuses.has(StatusEntitlement.Orphan)
        },
        setManual: (decision: FusionDecision): void => {
            this._statuses.delete(StatusEntitlement.NonMatched)
            this._statuses.add(StatusEntitlement.Manual)
            this._addHistory(this._createDecisionHistoryMessage(decision, 'manual'))
        },
        setAuthorized: (decision: FusionDecision): void => {
            this._statuses.delete(StatusEntitlement.NonMatched)
            if (decision.automaticAssignment === true) {
                this._statuses.add(StatusEntitlement.Auto)
            } else {
                this._statuses.add(StatusEntitlement.Authorized)
            }
            this._addHistory(this._createDecisionHistoryMessage(decision, 'authorized'))
        },
    }

    readonly actions = {
        add: (action: string, message?: string): void => {
            this._addToSet(this._actions, action, message)
        },
        remove: (action: string, message?: string): void => {
            this._removeFromSet(this._actions, action, message)
        },
        addFusionDecision: (decision: string): void => {
            this.actions.add(decision, `Fusion decision added: ${decision}`)
        },
        setSourceReviewer: (sourceId: string): void => {
            this._actions.add(`${FusionAction.ReviewerPrefix}${sourceId}`)
            this._statuses.add(StatusEntitlement.Reviewer)
        },
        removeSourceReviewer: (sourceId: string): void => {
            this._actions.delete(`${FusionAction.ReviewerPrefix}${sourceId}`)
            if (!this._actionsHasReviewerScope()) {
                this._statuses.delete(StatusEntitlement.Reviewer)
            }
        },
        listReviewerSources: (): string[] => {
            const prefix = FusionAction.ReviewerPrefix
            const result: string[] = []
            for (const action of this._actions) {
                if (action.startsWith(prefix)) {
                    result.push(action.slice(prefix.length))
                }
            }
            return result
        },
    }

    private _actionsHasReviewerScope(): boolean {
        const prefix = FusionAction.ReviewerPrefix
        for (const action of this._actions) {
            if (action.startsWith(prefix)) {
                return true
            }
        }
        return false
    }

    readonly reviews = {
        add: (review: string, message?: string): void => {
            this._addToSet(this._reviews, review, message)
        },
        remove: (review: string, message?: string): void => {
            this._removeFromSet(this._reviews, review, message)
        },
        addFusionReview: (reviewUrl: string): void => {
            this._reviews.add(reviewUrl)
            this._statuses.add(StatusEntitlement.ActiveReviews)
        },
        removeFusionReview: (reviewUrl: string): void => {
            this._reviews.delete(reviewUrl)
            if (this._reviews.size === 0) {
                this._statuses.delete(StatusEntitlement.ActiveReviews)
            }
        },
        clearFusionReviews: (): void => {
            this._reviews.clear()
            this._statuses.delete(StatusEntitlement.ActiveReviews)
        },
        addPendingUrl: (reviewUrl: string): void => {
            if (reviewUrl) {
                this._pendingReviewUrls.add(reviewUrl)
            }
        },
        addPromise: (promise: Promise<string | undefined>): void => {
            if (promise) {
                this._reviewPromises.push(promise)
            }
        },
    }

    readonly sources = {
        add: (source: string, message?: string): void => {
            this._addToSet(this._sources, source, message)
        },
        remove: (source: string, message?: string): void => {
            this._removeFromSet(this._sources, source, message)
        },
    }

    readonly matches = {
        add: (fusionMatch: FusionMatch): void => {
            this._fusionMatches.push(fusionMatch)
        },
        clearRefs: (): void => {
            for (const match of this._fusionMatches) {
                ;(match as { fusionIdentity?: unknown }).fusionIdentity = undefined
            }
        },
    }

    readonly historyOps = {
        importFromArray: (history: string[]): void => {
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

            this._history = dedupedHistory.slice(-this.maxHistoryMessages)
        },
    }

    // ============================================================================
    // Sync to attribute bag
    // ============================================================================

    syncToBag(bag: Attributes, originSource?: string, originAccount?: string, identityId?: string): void {
        bag[FusionAttribute.Reviews] = Array.from(this._reviews)
        bag[FusionAttribute.Accounts] = Array.from(this._accountIds)
        bag[FusionAttribute.Statuses] = Array.from(this._statuses)
        bag[FusionAttribute.Actions] = Array.from(this._actions)
        bag[FusionAttribute.MissingAccounts] = Array.from(this._missingAccountIds)
        bag[FusionAttribute.Sources] = attrConcat(Array.from(this._sources))
        bag[FusionAttribute.History] = Array.from(this._history)
        if (originSource !== undefined) bag[FusionAttribute.OriginSource] = originSource
        if (originAccount !== undefined) bag[FusionAttribute.OriginAccount] = originAccount
        if (identityId) bag[FusionAttribute.IdentityId] = identityId
    }
}
