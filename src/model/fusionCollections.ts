import { Attributes } from '@sailpoint/connector-sdk'
import { FusionAttribute } from '../data/schema'
import { attrConcat } from '../services/mappingService/helpers'
import { FusionMatch } from '../services/matchingService'
import { missing, trimStr } from '../utils/safeRead'
import { FusionDecision } from './form'
import { SourceType } from './config'
import { FusionAction } from './fusionAction'
import { StatusEntitlement } from './statusEntitlement'
import type { FusionManagedAccountInfo } from './fusionAccountTypes'

/**
 * Fusion account collaborator for collection state: account-id sets, missing-accounts,
 * statuses, actions, reviews, sources, fusion matches, history, and sync-to-bag.
 */
export class FusionCollections {
    private accountIdsValue = new Set<string>()
    private missingAccountIdsValue = new Set<string>()
    private statusesValue = new Set<string>()
    private actionsValue = new Set<string>()
    private reviewsValue = new Set<string>()
    private sourcesValue = new Set<string>()
    private fusionMatchesValue: FusionMatch[] = []
    private historyValue: string[] = []
    private previousAccountIdsValue = new Set<string>()
    private managedAccountInfoValue = new Map<string, FusionManagedAccountInfo>()
    private pendingReviewUrlsValue = new Set<string>()
    private reviewPromisesValue: Array<Promise<string | undefined>> = []

    constructor(private readonly maxHistoryMessages: number) {}

    // ============================================================================
    // Read-only getters
    // ============================================================================

    get accountIds(): ReadonlySet<string> {
        return this.accountIdsValue
    }

    get missingAccountIds(): ReadonlySet<string> {
        return this.missingAccountIdsValue
    }

    get statusesSet(): ReadonlySet<string> {
        return this.statusesValue
    }

    get actionsSet(): ReadonlySet<string> {
        return this.actionsValue
    }

    get reviewsSet(): ReadonlySet<string> {
        return this.reviewsValue
    }

    get sourcesSet(): ReadonlySet<string> {
        return this.sourcesValue
    }

    get fusionMatches(): readonly FusionMatch[] {
        return this.fusionMatchesValue
    }

    get history(): readonly string[] {
        return this.historyValue
    }

    get managedAccountInfo(): ReadonlyMap<string, FusionManagedAccountInfo> {
        return this.managedAccountInfoValue
    }

    get pendingReviewUrls(): ReadonlySet<string> {
        return this.pendingReviewUrlsValue
    }

    get reviewPromises(): readonly Promise<string | undefined>[] {
        return this.reviewPromisesValue
    }

    get previousAccountIds(): ReadonlySet<string> {
        return this.previousAccountIdsValue
    }

    // ============================================================================
    // Hydrate / seed APIs (factory + collaborator construction)
    // ============================================================================

    /**
     * Restore collection slices from persisted attribute values.
     * Additive for sources/statuses/actions/accountIds unless a clear* flag is set.
     * `previousAccountIds` always replaces when provided.
     */
    hydratePersisted(input: {
        sources?: Iterable<string>
        statuses?: Iterable<string>
        actions?: Iterable<string>
        reviews?: Iterable<string>
        missingAccountIds?: Iterable<string>
        accountIds?: Iterable<string>
        previousAccountIds?: Iterable<string>
        clearMissingBeforeAdd?: boolean
        clearReviewsBeforeAdd?: boolean
    }): void {
        if (input.clearMissingBeforeAdd) {
            this.missingAccountIdsValue.clear()
        }
        if (input.clearReviewsBeforeAdd) {
            this.reviewsValue.clear()
        }

        if (input.sources) {
            for (const source of input.sources) {
                this.sourcesValue.add(source)
            }
        }
        if (input.statuses) {
            for (const status of input.statuses) {
                this.statusesValue.add(status)
            }
        }
        if (input.actions) {
            for (const action of input.actions) {
                this.actionsValue.add(action)
            }
        }
        if (input.reviews) {
            for (const review of input.reviews) {
                this.reviewsValue.add(review)
            }
        }
        if (input.accountIds) {
            for (const id of input.accountIds) {
                this.accountIdsValue.add(id)
            }
        }
        if (input.missingAccountIds) {
            for (const id of input.missingAccountIds) {
                this.missingAccountIdsValue.add(id)
            }
        }
        if (input.previousAccountIds) {
            this.setPreviousAccountIds(input.previousAccountIds)
        }
    }

    /** Replace correlated account IDs with the given set. */
    replaceAccountIds(ids: Iterable<string>): void {
        this.accountIdsValue = new Set(ids)
    }

    /** Replace missing account IDs with the given set. */
    replaceMissingAccountIds(ids: Iterable<string>): void {
        this.missingAccountIdsValue = new Set(ids)
    }

    /** Replace previous-run account IDs with the given set. */
    setPreviousAccountIds(ids: Iterable<string>): void {
        this.previousAccountIdsValue = new Set(ids)
    }

    /** Store managed-account display/schema info for a composite account key. */
    setManagedAccountInfo(accountId: string, info: FusionManagedAccountInfo): void {
        this.managedAccountInfoValue.set(accountId, info)
    }

    /** Drop managed-account info for a composite account key. */
    deleteManagedAccountInfo(accountId: string): void {
        this.managedAccountInfoValue.delete(accountId)
    }

    /** Append a dated history message (same formatting as runtime history writes). */
    addHistoryMessage(message: string): void {
        this.addHistory(message)
    }

    /** Whether the actions set contains the given action. */
    hasAction(action: string): boolean {
        return this.actionsValue.has(action)
    }

    /** Remove an action without writing history. */
    removeActionSilent(action: string): void {
        this.actionsValue.delete(action)
    }

    // ============================================================================
    // Private helpers
    // ============================================================================

    private addHistory(message?: string): void {
        const normalizedMessage = trimStr(message) ?? ''
        if (missing(normalizedMessage)) return

        const now = new Date().toISOString().split('T')[0]
        const datedMessage = `[${now}] ${normalizedMessage}`
        const previousMessage = this.historyValue[this.historyValue.length - 1]
        if (previousMessage === datedMessage) return
        this.historyValue.push(datedMessage)

        if (this.historyValue.length > this.maxHistoryMessages) {
            this.historyValue = this.historyValue.slice(-this.maxHistoryMessages)
        }
    }

    private normalizeHistoryLabel(value: unknown, fallback: string): string {
        return trimStr(value) ?? fallback
    }

    private formatHistoryAccountInfo(name: unknown, source: unknown): string {
        const accountLabel = this.normalizeHistoryLabel(name, 'Unknown account')
        const sourceLabel = this.normalizeHistoryLabel(source, 'Unknown source')
        return `${accountLabel} [${sourceLabel}]`
    }

    private resolveHistoryActorLabel(
        name: unknown,
        email: unknown,
        id: string | undefined,
        fallback: string
    ): string {
        const normalizedName = trimStr(name)
        const normalizedEmail = trimStr(email)
        if (normalizedName && normalizedName !== id) {
            return normalizedName
        }
        if (normalizedEmail) {
            return normalizedEmail
        }
        return fallback
    }

    private formatMergeTargetLabel(decision: FusionDecision): string {
        return this.resolveHistoryActorLabel(
            decision.identityName,
            undefined,
            decision.identityId,
            'existing identity'
        )
    }

    private createDecisionHistoryMessage(decision: FusionDecision, action: string): string {
        const submitterName = this.resolveHistoryActorLabel(
            decision.submitter.name,
            decision.submitter.email,
            decision.submitter.id,
            'Unknown reviewer'
        )
        const accountInfo = this.formatHistoryAccountInfo(decision.account.name, decision.account.sourceName)
        const mergeTargetLabel = this.formatMergeTargetLabel(decision)
        const sourceType = decision.sourceType ?? SourceType.Authoritative

        if (action === 'manual') {
            return `Set ${accountInfo} as new account by ${submitterName}`
        }

        if (decision.automaticMerge === true) {
            return mergeTargetLabel === 'existing identity'
                ? `Auto-merged ${accountInfo} into existing identity`
                : `Auto-merged ${accountInfo} into ${mergeTargetLabel}`
        }
        if (sourceType === SourceType.Record) {
            return `Merged record ${accountInfo} into ${mergeTargetLabel} by ${submitterName}`
        }
        if (sourceType === SourceType.Orphan) {
            return `Merged orphan account ${accountInfo} into ${mergeTargetLabel} by ${submitterName}`
        }
        return `Merged ${accountInfo} into ${mergeTargetLabel} by ${submitterName}`
    }

    private addToSet<T>(set: Set<T>, item: T, message?: string): boolean {
        const initialSize = set.size
        set.add(item)
        const added = set.size > initialSize
        if (added && message) {
            this.addHistory(message)
        }
        return added
    }

    private removeFromSet<T>(set: Set<T>, item: T, message?: string): boolean {
        const removed = set.delete(item)
        if (removed && message) {
            this.addHistory(message)
        }
        return removed
    }

    // ============================================================================
    // Public namespaced operations
    // ============================================================================

    readonly accounts = {
        add: (id: string, message?: string): void => {
            this.addToSet(this.accountIdsValue, id, message)
        },
        remove: (id: string, message?: string): boolean => {
            return this.removeFromSet(this.accountIdsValue, id, message)
        },
        addMissing: (id: string, message?: string): void => {
            this.addToSet(this.missingAccountIdsValue, id, message)
        },
        removeMissing: (id: string, message?: string): boolean => {
            return this.removeFromSet(this.missingAccountIdsValue, id, message)
        },
        getMissingForSource: (sourceName: string): string[] => {
            const result: string[] = []
            for (const id of this.missingAccountIdsValue) {
                const info = this.managedAccountInfoValue.get(id)
                if (info && info.source.name === sourceName) {
                    result.push(id)
                }
            }
            return result
        },
        removeSourceAccount: (id: string, fromIdentity?: boolean, originIdentityInScope?: boolean): void => {
            this.removeFromSet(this.accountIdsValue, id, '')

            if (this.accountIdsValue.size === 0) {
                if (!fromIdentity || !originIdentityInScope) {
                    this.statusesValue.add(StatusEntitlement.Orphan)
                    this.addHistory(`Account became orphan after removing source account: ${id}`)
                } else {
                    this.statusesValue.delete(StatusEntitlement.Orphan)
                }
            }

            this.addHistory(`Source account removed: ${id}`)
        },
    }

    readonly statuses = {
        add: (status: string, message?: string): void => {
            this.addToSet(this.statusesValue, status, message)
        },
        remove: (status: string, message?: string): void => {
            this.removeFromSet(this.statusesValue, status, message)
        },
        has: (status: string): boolean => {
            return this.statusesValue.has(status)
        },
        setNonMatched: (actorName?: string, sourceName?: string): void => {
            this.statusesValue.add(StatusEntitlement.NonMatched)
            this.addHistory(
                `Set ${this.formatHistoryAccountInfo(actorName, sourceName)} as NonMatched`
            )
        },
        setUncorrelatedAccount: (accountId: string): void => {
            if (!accountId) return
            this.accounts.add(accountId)
            this.accounts.addMissing(accountId)
            this.statusesValue.add(StatusEntitlement.Uncorrelated)
            this.actionsValue.delete(FusionAction.Correlated)
        },
        isOrphan: (): boolean => {
            return this.statusesValue.has(StatusEntitlement.Orphan)
        },
        setManual: (decision: FusionDecision): void => {
            this.statusesValue.delete(StatusEntitlement.NonMatched)
            this.statusesValue.add(StatusEntitlement.Manual)
            this.addHistory(this.createDecisionHistoryMessage(decision, 'manual'))
        },
        setAuthorized: (decision: FusionDecision): void => {
            this.statusesValue.delete(StatusEntitlement.NonMatched)
            if (decision.automaticMerge === true) {
                this.statusesValue.add(StatusEntitlement.Auto)
            } else {
                this.statusesValue.add(StatusEntitlement.Authorized)
            }
            this.addHistory(this.createDecisionHistoryMessage(decision, 'authorized'))
        },
    }

    readonly actions = {
        add: (action: string, message?: string): void => {
            this.addToSet(this.actionsValue, action, message)
        },
        remove: (action: string, message?: string): void => {
            this.removeFromSet(this.actionsValue, action, message)
        },
        addFusionDecision: (decision: string): void => {
            this.actions.add(decision, `Fusion decision added: ${decision}`)
        },
        setSourceReviewer: (sourceId: string): void => {
            this.actionsValue.add(`${FusionAction.ReviewerPrefix}${sourceId}`)
            this.statusesValue.add(StatusEntitlement.Reviewer)
        },
        removeSourceReviewer: (sourceId: string): void => {
            this.actionsValue.delete(`${FusionAction.ReviewerPrefix}${sourceId}`)
            if (!this.actionsHasReviewerScope()) {
                this.statusesValue.delete(StatusEntitlement.Reviewer)
            }
        },
        listReviewerSources: (): string[] => {
            const prefix = FusionAction.ReviewerPrefix
            const result: string[] = []
            for (const action of this.actionsValue) {
                if (action.startsWith(prefix)) {
                    result.push(action.slice(prefix.length))
                }
            }
            return result
        },
    }

    private actionsHasReviewerScope(): boolean {
        const prefix = FusionAction.ReviewerPrefix
        for (const action of this.actionsValue) {
            if (action.startsWith(prefix)) {
                return true
            }
        }
        return false
    }

    readonly reviews = {
        add: (review: string, message?: string): void => {
            this.addToSet(this.reviewsValue, review, message)
        },
        remove: (review: string, message?: string): void => {
            this.removeFromSet(this.reviewsValue, review, message)
        },
        addFusionReview: (reviewUrl: string): void => {
            this.reviewsValue.add(reviewUrl)
            this.statusesValue.add(StatusEntitlement.ActiveReviews)
        },
        removeFusionReview: (reviewUrl: string): void => {
            this.reviewsValue.delete(reviewUrl)
            if (this.reviewsValue.size === 0) {
                this.statusesValue.delete(StatusEntitlement.ActiveReviews)
            }
        },
        clearFusionReviews: (): void => {
            this.reviewsValue.clear()
            this.statusesValue.delete(StatusEntitlement.ActiveReviews)
        },
        addPendingUrl: (reviewUrl: string): void => {
            if (reviewUrl) {
                this.pendingReviewUrlsValue.add(reviewUrl)
            }
        },
        addPromise: (promise: Promise<string | undefined>): void => {
            if (promise) {
                this.reviewPromisesValue.push(promise)
            }
        },
    }

    readonly sources = {
        add: (source: string, message?: string): void => {
            this.addToSet(this.sourcesValue, source, message)
        },
        remove: (source: string, message?: string): void => {
            this.removeFromSet(this.sourcesValue, source, message)
        },
    }

    readonly matches = {
        add: (fusionMatch: FusionMatch): void => {
            this.fusionMatchesValue.push(fusionMatch)
        },
        clearRefs: (): void => {
            for (const match of this.fusionMatchesValue) {
                ;(match as { fusionIdentity?: unknown }).fusionIdentity = undefined
            }
        },
        removeDeferred: (): void => {
            for (let i = this.fusionMatchesValue.length - 1; i >= 0; i--) {
                if (this.fusionMatchesValue[i].candidateType === 'deferred') {
                    this.fusionMatchesValue.splice(i, 1)
                }
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

            this.historyValue = dedupedHistory.slice(-this.maxHistoryMessages)
        },
    }

    // ============================================================================
    // Sync to attribute bag
    // ============================================================================

    syncToBag(bag: Attributes, originSource?: string, originAccount?: string, identityId?: string): void {
        bag[FusionAttribute.Reviews] = Array.from(this.reviewsValue)
        bag[FusionAttribute.Accounts] = Array.from(this.accountIdsValue)
        bag[FusionAttribute.Statuses] = Array.from(this.statusesValue)
        bag[FusionAttribute.Actions] = Array.from(this.actionsValue)
        bag[FusionAttribute.MissingAccounts] = Array.from(this.missingAccountIdsValue)
        bag[FusionAttribute.Sources] = attrConcat(Array.from(this.sourcesValue))
        bag[FusionAttribute.History] = Array.from(this.historyValue)
        if (originSource !== undefined) bag[FusionAttribute.OriginSource] = originSource
        if (originAccount !== undefined) bag[FusionAttribute.OriginAccount] = originAccount
        if (identityId) bag[FusionAttribute.IdentityId] = identityId
    }
}






