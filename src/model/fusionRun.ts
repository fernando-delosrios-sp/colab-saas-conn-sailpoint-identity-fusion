import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount, FusionAccountKind } from './account'
import { SourceInfo } from '../services/sourceService'
import { FusionDecision } from './form'
import { ManagedAccountAnalysisRecorder } from '../services/fusionService/managedAccountAnalysisRecorder'
import { AggregationTracker } from '../services/fusionService/aggregationTracker'
import { FusionReportBlend } from '../services/fusionService/types'
import { LogService } from '../services/logService'
import { hasValue, readString, trimStr } from '../utils/safeRead'
import { assert } from '../utils/assert'
import { buildManagedAccountKey } from './managedAccountKey'
import { mapValuesToArray } from '../services/fusionService/collections'

export interface RunStateSnapshot {
    managedAccounts: Record<string, any>[]
    fusionAccounts: Record<string, any>[]
    identities: Record<string, any>[]
    fusionIdentityDecisions: Record<string, any>[]
    pendingCandidateIdentityIds: string[]
    pendingReviewUrlsByReviewerId: Record<string, string[]>
    pendingReviewUrlsByCandidateId: Record<string, string[]>
    sourcesByName: Record<string, any>
    currentRunNonMatchedKeysBySource: Record<string, string[]>
    fusionBlends: Record<string, any>[]
    autoAssignedIds: string[]
    matchScoringMs: number
    phaseTimings: { phase: string; elapsed: string }[]
}

export interface ManagedAccountEntry {
    readonly accountKey: string
    readonly account: Account
    readonly identityId?: string
}

export interface WorkQueue {
    get(key: string): Account | undefined
    getKeysForIdentity(identityId: string): ReadonlySet<string> | undefined
    claimAccount(key: string, identityId?: string): boolean
    claimAccountsForIdentity(identityId: string): number
    entries(): IterableIterator<[string, Account]>
}

export class FusionRun implements WorkQueue {
    readonly managedAccountsById = new Map<string, Account>()
    readonly managedAccountsByIdentityId = new Map<string, Set<string>>()
    readonly fusionAccountMap = new Map<string, FusionAccount>()
    readonly fusionIdentityMap = new Map<string, FusionAccount>()
    readonly identityMap = new Map<string, IdentityDocument>()
    readonly sourcesByName = new Map<string, SourceInfo>()
    readonly autoAssignedIdentityIds = new Set<string>()
    readonly currentRunNonMatchedKeysBySource = new Map<string, Set<string>>()
    readonly reviewersBySourceId = new Map<string, Set<FusionAccount>>()
    readonly sourcesWithoutReviewers = new Set<string>()
    linkedAccountKeyIndex: Set<string> | undefined
    fusionIdentityDecisions: FusionDecision[] = []
    pendingCandidateIdentityIds: Set<string> = new Set()
    pendingReviewUrlsByReviewerId: Map<string, string[]> = new Map()
    pendingReviewUrlsByCandidateId: Map<string, string[]> = new Map()
    fusionBlends: FusionReportBlend[] = []
    matchScoringMs = 0
    analysisRecorder?: ManagedAccountAnalysisRecorder
    tracker?: AggregationTracker
    phaseTimings: { phase: string; elapsed: string }[] = []
    managedSources: SourceInfo[] = []
    managedAccountsAllById?: Map<string, Account>

    constructor(public log?: LogService) {}

    setManagedAccount(accountKey: string, account: Account): void {
        this.managedAccountsById.set(accountKey, account)
        if (account.identityId) {
            let idSet = this.managedAccountsByIdentityId.get(account.identityId)
            if (!idSet) {
                idSet = new Set()
                this.managedAccountsByIdentityId.set(account.identityId, idSet)
            }
            idSet.add(accountKey)
        }
    }

    claimAccount(accountKey: string, identityId?: string): boolean {
        const deleted = this.managedAccountsById.delete(accountKey)
        if (identityId) {
            const idSet = this.managedAccountsByIdentityId.get(identityId)
            if (idSet) {
                idSet.delete(accountKey)
                if (idSet.size === 0) {
                    this.managedAccountsByIdentityId.delete(identityId)
                }
            }
        }
        return deleted
    }

    claimAccountsForIdentity(identityId: string): number {
        const idSet = this.managedAccountsByIdentityId.get(identityId)
        if (!idSet) return 0
        let deleted = 0
        for (const key of idSet) {
            if (this.managedAccountsById.delete(key)) {
                deleted++
            }
        }
        this.managedAccountsByIdentityId.delete(identityId)
        return deleted
    }

    get(key: string): Account | undefined {
        return this.managedAccountsById.get(key)
    }

    getKeysForIdentity(identityId: string): ReadonlySet<string> | undefined {
        return this.managedAccountsByIdentityId.get(identityId)
    }

    entries(): IterableIterator<[string, Account]> {
        return this.managedAccountsById.entries()
    }

    clearWorkQueue(): void {
        this.managedAccountsById.clear()
        this.managedAccountsByIdentityId.clear()
    }

    registerFusionAccount(fusionAccount: FusionAccount, tracker?: AggregationTracker): void {
        const identityId = fusionAccount.identityId
        if (hasValue(identityId) && fusionAccount.type !== FusionAccountKind.Managed) {
            const existingFusionAccount = this.fusionIdentityMap.get(identityId!)
            if (existingFusionAccount) {
                this._trackConflictingFusionIdentity(identityId!, existingFusionAccount, fusionAccount, tracker)
            }
            this.fusionIdentityMap.set(identityId!, fusionAccount)
        } else {
            assert(
                fusionAccount.managedKey,
                'Fusion account must have a managedKey to be added to fusion account map'
            )
            this.fusionAccountMap.set(fusionAccount.managedKey, fusionAccount)
        }
    }

    removeFusionAccount(fa: FusionAccount): boolean {
        const managedKey = fa.managedKey
        if (managedKey && this.fusionAccountMap.get(managedKey) === fa) {
            return this.fusionAccountMap.delete(managedKey)
        }
        for (const [id, account] of this.fusionIdentityMap.entries()) {
            if (account === fa) {
                return this.fusionIdentityMap.delete(id)
            }
        }
        return false
    }

    getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this.fusionIdentityMap.get(identityId)
    }

    getFusionAccountByManagedKey(managedKey: string): FusionAccount | undefined {
        return this.fusionAccountMap.get(managedKey)
    }

    hasFusionIdentity(identityId: string): boolean {
        return this.fusionIdentityMap.has(identityId)
    }

    get totalFusionAccountCount(): number {
        return this.fusionIdentityMap.size + this.fusionAccountMap.size
    }

    get allFusionAccounts(): FusionAccount[] {
        return mapValuesToArray(this.fusionAccountMap)
    }

    get allFusionIdentities(): Iterable<FusionAccount> {
        return this.fusionIdentityMap.values()
    }

    *fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount> {
        for (const identity of this.fusionIdentityMap.values()) {
            if (!identity.identityId || !excludeIds.has(identity.identityId)) {
                yield identity
            }
        }
    }

    findFusionAccountForIdentity(
        identity: IdentityDocument,
        sourceNames: Set<string>
    ): FusionAccount | undefined {
        const identityAccountIds = new Set<string>(
            (identity.accounts ?? [])
                .filter((a) => sourceNames.has(a.source?.name ?? ''))
                .map((a) =>
                    buildManagedAccountKey({
                        sourceId: a.source?.id,
                        nativeIdentity: readString(a, 'nativeIdentity'),
                    })
                )
                .filter((value): value is string => Boolean(value))
        )
        if (identityAccountIds.size === 0) return undefined

        for (const account of this.fusionAccountMap.values()) {
            if (this._hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        for (const [existingIdentityId, account] of this.fusionIdentityMap.entries()) {
            if (existingIdentityId === identity.id) continue
            if (this._hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        return undefined
    }

    addIdentity(id: string, doc: IdentityDocument): void {
        this.identityMap.set(id, doc)
    }

    removeIdentity(id: string): void {
        this.identityMap.delete(id)
    }

    clearIdentities(): void {
        this.identityMap.clear()
    }

    getIdentity(id: string): IdentityDocument | undefined {
        return this.identityMap.get(id)
    }

    hasIdentity(id: string): boolean {
        return this.identityMap.has(id)
    }

    markAutoAssigned(identityId: string): void {
        this.autoAssignedIdentityIds.add(identityId)
    }

    isAutoAssigned(identityId: string): boolean {
        return this.autoAssignedIdentityIds.has(identityId)
    }

    resetScoringState(): void {
        this.autoAssignedIdentityIds.clear()
        this.matchScoringMs = 0
    }

    initLinkedAccountIndex(): void {
        this.linkedAccountKeyIndex = new Set<string>()
    }

    clearLinkedAccountIndex(): void {
        this.linkedAccountKeyIndex = undefined
    }

    addDecision(decision: FusionDecision): void {
        this.fusionIdentityDecisions.push(decision)
    }

    clearDecisions(): void {
        this.fusionIdentityDecisions = []
    }

    addReviewUrlForReviewer(reviewerId: string, url: string): void {
        const list = this.pendingReviewUrlsByReviewerId.get(reviewerId) ?? []
        list.push(url)
        this.pendingReviewUrlsByReviewerId.set(reviewerId, list)
    }

    addReviewUrlForCandidate(candidateId: string, url: string): void {
        const list = this.pendingReviewUrlsByCandidateId.get(candidateId) ?? []
        list.push(url)
        this.pendingReviewUrlsByCandidateId.set(candidateId, list)
    }

    addPendingCandidateId(candidateId: string): void {
        this.pendingCandidateIdentityIds.add(candidateId)
    }

    getReviewerUrls(reviewerId: string): string[] | undefined {
        return this.pendingReviewUrlsByReviewerId.get(reviewerId)
    }

    getCandidateUrls(candidateId: string): string[] | undefined {
        return this.pendingReviewUrlsByCandidateId.get(candidateId)
    }

    clearNonMatchedKeys(): void {
        this.currentRunNonMatchedKeysBySource.clear()
    }

    private _hasIntersectingManagedAccounts(
        account: FusionAccount,
        identityAccountIds: Set<string>
    ): boolean {
        for (const id of account.accountIdsSet) {
            if (identityAccountIds.has(id)) return true
        }
        for (const id of account.missingAccountIdsSet) {
            if (identityAccountIds.has(id)) return true
        }
        return false
    }

    private _trackConflictingFusionIdentity(
        identityId: string,
        existingAccount: FusionAccount,
        newAccount: FusionAccount,
        tracker?: AggregationTracker
    ): void {
        if (!tracker || !this.log) return

        const existingKey = this._conflictTrackingKey(existingAccount)
        const incomingKey = this._conflictTrackingKey(newAccount)
        if (existingKey === incomingKey) return

        let accounts = tracker.conflictingFusionIdentityAccounts.get(identityId)
        if (!accounts) {
            accounts = new Map()
            tracker.conflictingFusionIdentityAccounts.set(identityId, accounts)
        }

        accounts.set(existingKey, existingAccount.name || existingAccount.displayName || existingKey)
        accounts.set(incomingKey, newAccount.name || newAccount.displayName || incomingKey)

        const accountLabels = Array.from(accounts.entries()).map(
            ([managedKey, name]) => `${name} (${managedKey})`
        )
        this.log.warn(
            `More than one Fusion account was found for identity ${identityId} (${accounts.size} account(s)): ${accountLabels.join(', ')}. ` +
                'This is generally caused by non-unique account names. Please review the configuration and consider using a unique attribute for the account name.'
        )
    }

    private _conflictTrackingKey(fa: FusionAccount): string {
        const managedKey = fa.managedKeyOrUndefined
        const trimmedManagedKey = trimStr(managedKey)
        if (trimmedManagedKey) {
            return trimmedManagedKey
        }
        const name = fa.name || fa.displayName || 'unknown'
        return `name:${name}`
    }

    snapshot(): RunStateSnapshot {
        return {
            managedAccounts: Array.from(this.managedAccountsById.values()),
            fusionAccounts: Array.from(this.fusionAccountMap.values()),
            identities: Array.from(this.identityMap.values()),
            fusionIdentityDecisions: this.fusionIdentityDecisions.map((d) => ({ ...d })),
            pendingCandidateIdentityIds: Array.from(this.pendingCandidateIdentityIds),
            pendingReviewUrlsByReviewerId: Object.fromEntries(this.pendingReviewUrlsByReviewerId),
            pendingReviewUrlsByCandidateId: Object.fromEntries(this.pendingReviewUrlsByCandidateId),
            sourcesByName: Object.fromEntries(this.sourcesByName),
            currentRunNonMatchedKeysBySource: Object.fromEntries(
                Array.from(this.currentRunNonMatchedKeysBySource).map(([k, v]) => [k, Array.from(v)])
            ),
            fusionBlends: this.fusionBlends,
            autoAssignedIds: Array.from(this.autoAssignedIdentityIds),
            matchScoringMs: this.matchScoringMs,
            phaseTimings: this.phaseTimings,
        }
    }

    restore(snapshot: RunStateSnapshot): void {
        this.managedAccountsById.clear()
        for (const account of snapshot.managedAccounts) {
            this.managedAccountsById.set((account as any).id ?? (account as any).name, account as Account)
        }
        this.fusionAccountMap.clear()
        for (const account of snapshot.fusionAccounts) {
            this.fusionAccountMap.set((account as any).managedKey ?? (account as any).name, account as FusionAccount)
        }
        this.identityMap.clear()
        for (const identity of snapshot.identities) {
            this.identityMap.set((identity as any).id, identity as IdentityDocument)
        }
        this.fusionIdentityDecisions = snapshot.fusionIdentityDecisions as FusionDecision[]
        this.pendingCandidateIdentityIds = new Set(snapshot.pendingCandidateIdentityIds)
        this.pendingReviewUrlsByReviewerId = new Map(Object.entries(snapshot.pendingReviewUrlsByReviewerId))
        this.pendingReviewUrlsByCandidateId = new Map(Object.entries(snapshot.pendingReviewUrlsByCandidateId))
        this.sourcesByName.clear()
        for (const [k, v] of Object.entries(snapshot.sourcesByName)) {
            this.sourcesByName.set(k, v as SourceInfo)
        }
        this.currentRunNonMatchedKeysBySource.clear()
        for (const [k, v] of Object.entries(snapshot.currentRunNonMatchedKeysBySource)) {
            this.currentRunNonMatchedKeysBySource.set(k, new Set(v))
        }
        this.fusionBlends = snapshot.fusionBlends as FusionReportBlend[]
        this.autoAssignedIdentityIds.clear()
        for (const id of snapshot.autoAssignedIds) {
            this.autoAssignedIdentityIds.add(id)
        }
        this.matchScoringMs = snapshot.matchScoringMs
        this.phaseTimings = snapshot.phaseTimings
    }
}
