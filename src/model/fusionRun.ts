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



export class FusionRun {
    public readonly isRecordMode: boolean
    readonly managedAccountsById = new Map<string, Account>()
    readonly managedAccountsByIdentityId = new Map<string, Set<string>>()
    private readonly _fusionAccountMap = new Map<string, FusionAccount>()
    private readonly _fusionIdentityMap = new Map<string, FusionAccount>()
    private readonly _identityMap = new Map<string, IdentityDocument>()
    readonly sourcesByName = new Map<string, SourceInfo>()
    private readonly _autoAssignedIdentityIds = new Set<string>()
    private readonly _currentRunNonMatchedKeysBySource = new Map<string, Set<string>>()
    readonly reviewersBySourceId = new Map<string, Set<FusionAccount>>()
    readonly sourcesWithoutReviewers = new Set<string>()
    private _linkedAccountKeyIndex: Set<string> | undefined
    private _fusionIdentityDecisions: FusionDecision[] = []
    private _pendingCandidateIdentityIds: Set<string> = new Set()
    private _pendingReviewUrlsByReviewerId: Map<string, string[]> = new Map()
    private _pendingReviewUrlsByCandidateId: Map<string, string[]> = new Map()
    fusionBlends: FusionReportBlend[] = []
    matchScoringMs = 0
    analysisRecorder?: ManagedAccountAnalysisRecorder
    tracker?: AggregationTracker
    phaseTimings: { phase: string; elapsed: string }[] = []
    managedSources: SourceInfo[] = []
    managedAccountsAllById?: Map<string, Account>

    get autoAssignedCount(): number {
        return this._autoAssignedIdentityIds.size
    }

    get autoAssignedIdentityIds(): ReadonlySet<string> {
        return this._autoAssignedIdentityIds
    }

    get identityCount(): number {
        return this._identityMap.size
    }

    get allIdentities(): IdentityDocument[] {
        return Array.from(this._identityMap.values())
    }

    identityValues(): IterableIterator<IdentityDocument> {
        return this._identityMap.values()
    }

    get fusionAccountMap(): ReadonlyMap<string, FusionAccount> {
        return this._fusionAccountMap
    }

    get linkedAccountKeyIndex(): ReadonlySet<string> | undefined {
        return this._linkedAccountKeyIndex
    }

    addToLinkedAccountIndex(key: string): void {
        this._linkedAccountKeyIndex?.add(key)
    }

    get fusionIdentityDecisions(): readonly FusionDecision[] {
        return this._fusionIdentityDecisions
    }

    get pendingCandidateIdentityIds(): ReadonlySet<string> {
        return this._pendingCandidateIdentityIds
    }

    get pendingReviewerUrlKeys(): IterableIterator<string> {
        return this._pendingReviewUrlsByReviewerId.keys()
    }

    get pendingCandidateUrlKeys(): IterableIterator<string> {
        return this._pendingReviewUrlsByCandidateId.keys()
    }

    clearReviewUrls(): void {
        this._pendingReviewUrlsByReviewerId = new Map()
        this._pendingReviewUrlsByCandidateId = new Map()
        this._pendingCandidateIdentityIds = new Set()
    }

    get pendingReviewUrlsByReviewerId(): ReadonlyMap<string, string[]> {
        return this._pendingReviewUrlsByReviewerId
    }

    get pendingReviewUrlsByCandidateId(): ReadonlyMap<string, string[]> {
        return this._pendingReviewUrlsByCandidateId
    }

    get fusionIdentityMap(): ReadonlyMap<string, FusionAccount> {
        return this._fusionIdentityMap
    }

    get identityMap(): ReadonlyMap<string, IdentityDocument> {
        return this._identityMap
    }

    constructor(public log?: LogService) {
        this.isRecordMode = process.env.RECORD_MODE === 'true'
    }

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
            const existingFusionAccount = this._fusionIdentityMap.get(identityId!)
            if (existingFusionAccount) {
                this._trackConflictingFusionIdentity(identityId!, existingFusionAccount, fusionAccount, tracker)
            }
            this._fusionIdentityMap.set(identityId!, fusionAccount)
        } else {
            assert(
                fusionAccount.managedKey,
                'Fusion account must have a managedKey to be added to fusion account map'
            )
            this._fusionAccountMap.set(fusionAccount.managedKey, fusionAccount)
        }
    }

    removeFusionAccount(fa: FusionAccount): boolean {
        const managedKey = fa.managedKey
        if (managedKey && this._fusionAccountMap.get(managedKey) === fa) {
            return this._fusionAccountMap.delete(managedKey)
        }
        for (const [id, account] of this._fusionIdentityMap.entries()) {
            if (account === fa) {
                return this._fusionIdentityMap.delete(id)
            }
        }
        return false
    }

    getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this._fusionIdentityMap.get(identityId)
    }

    getFusionAccountByManagedKey(managedKey: string): FusionAccount | undefined {
        return this._fusionAccountMap.get(managedKey)
    }

    hasFusionIdentity(identityId: string): boolean {
        return this._fusionIdentityMap.has(identityId)
    }

    get totalFusionAccountCount(): number {
        return this._fusionIdentityMap.size + this._fusionAccountMap.size
    }

    get allFusionAccounts(): FusionAccount[] {
        return Array.from(this._fusionAccountMap.values())
    }

    get allFusionIdentities(): Iterable<FusionAccount> {
        return this._fusionIdentityMap.values()
    }

    *fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount> {
        for (const identity of this._fusionIdentityMap.values()) {
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

        for (const account of this._fusionAccountMap.values()) {
            if (this._hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        for (const [existingIdentityId, account] of this._fusionIdentityMap.entries()) {
            if (existingIdentityId === identity.id) continue
            if (this._hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        return undefined
    }

    addIdentity(id: string, doc: IdentityDocument): void {
        this._identityMap.set(id, doc)
    }

    removeIdentity(id: string): void {
        this._identityMap.delete(id)
    }

    clearIdentities(): void {
        this._identityMap.clear()
    }

    getIdentity(id: string): IdentityDocument | undefined {
        return this._identityMap.get(id)
    }

    hasIdentity(id: string): boolean {
        return this._identityMap.has(id)
    }

    markAutoAssigned(identityId: string): void {
        this._autoAssignedIdentityIds.add(identityId)
    }

    isAutoAssigned(identityId: string): boolean {
        return this._autoAssignedIdentityIds.has(identityId)
    }

    resetScoringState(): void {
        this._autoAssignedIdentityIds.clear()
        this.matchScoringMs = 0
    }

    initLinkedAccountIndex(): void {
        this._linkedAccountKeyIndex = new Set<string>()
    }

    clearLinkedAccountIndex(): void {
        this._linkedAccountKeyIndex = undefined
    }

    addDecision(decision: FusionDecision): void {
        this._fusionIdentityDecisions.push(decision)
    }

    clearDecisions(): void {
        this._fusionIdentityDecisions = []
    }

    addReviewUrlForReviewer(reviewerId: string, url: string): void {
        const list = this._pendingReviewUrlsByReviewerId.get(reviewerId) ?? []
        list.push(url)
        this._pendingReviewUrlsByReviewerId.set(reviewerId, list)
    }

    addReviewUrlForCandidate(candidateId: string, url: string): void {
        const list = this._pendingReviewUrlsByCandidateId.get(candidateId) ?? []
        list.push(url)
        this._pendingReviewUrlsByCandidateId.set(candidateId, list)
    }

    addPendingCandidateId(candidateId: string): void {
        this._pendingCandidateIdentityIds.add(candidateId)
    }

    recordFusionBlend(blend: FusionReportBlend, tracker?: AggregationTracker): void {
        if (!tracker) return
        tracker.fusionBlends.push(blend)
    }

    getReviewerUrls(reviewerId: string): string[] | undefined {
        return this._pendingReviewUrlsByReviewerId.get(reviewerId)
    }

    getCandidateUrls(candidateId: string): string[] | undefined {
        return this._pendingReviewUrlsByCandidateId.get(candidateId)
    }

    clearNonMatchedKeys(): void {
        this._currentRunNonMatchedKeysBySource.clear()
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
            fusionAccounts: Array.from(this._fusionAccountMap.values()),
            identities: Array.from(this._identityMap.values()),
            fusionIdentityDecisions: this._fusionIdentityDecisions.map((d) => ({ ...d })),
            pendingCandidateIdentityIds: Array.from(this._pendingCandidateIdentityIds),
            pendingReviewUrlsByReviewerId: Object.fromEntries(this._pendingReviewUrlsByReviewerId),
            pendingReviewUrlsByCandidateId: Object.fromEntries(this._pendingReviewUrlsByCandidateId),
            sourcesByName: Object.fromEntries(this.sourcesByName),
            currentRunNonMatchedKeysBySource: Object.fromEntries(
                Array.from(this._currentRunNonMatchedKeysBySource).map(([k, v]) => [k, Array.from(v)])
            ),
            fusionBlends: this.fusionBlends,
            autoAssignedIds: Array.from(this._autoAssignedIdentityIds),
            matchScoringMs: this.matchScoringMs,
            phaseTimings: this.phaseTimings,
        }
    }

    restore(snapshot: RunStateSnapshot): void {
        this.managedAccountsById.clear()
        for (const account of snapshot.managedAccounts) {
            this.managedAccountsById.set((account as any).id ?? (account as any).name, account as Account)
        }
        this._fusionAccountMap.clear()
        for (const account of snapshot.fusionAccounts) {
            this._fusionAccountMap.set((account as any).managedKey ?? (account as any).name, account as FusionAccount)
        }
        this._identityMap.clear()
        for (const identity of snapshot.identities) {
            this._identityMap.set((identity as any).id, identity as IdentityDocument)
        }
        this._fusionIdentityDecisions = snapshot.fusionIdentityDecisions as FusionDecision[]
        this._pendingCandidateIdentityIds = new Set(snapshot.pendingCandidateIdentityIds)
        this._pendingReviewUrlsByReviewerId = new Map(Object.entries(snapshot.pendingReviewUrlsByReviewerId))
        this._pendingReviewUrlsByCandidateId = new Map(Object.entries(snapshot.pendingReviewUrlsByCandidateId))
        this.sourcesByName.clear()
        for (const [k, v] of Object.entries(snapshot.sourcesByName)) {
            this.sourcesByName.set(k, v as SourceInfo)
        }
        this._currentRunNonMatchedKeysBySource.clear()
        for (const [k, v] of Object.entries(snapshot.currentRunNonMatchedKeysBySource)) {
            this._currentRunNonMatchedKeysBySource.set(k, new Set(v))
        }
        this.fusionBlends = snapshot.fusionBlends as FusionReportBlend[]
        this._autoAssignedIdentityIds.clear()
        for (const id of snapshot.autoAssignedIds) {
            this._autoAssignedIdentityIds.add(id)
        }
        this.matchScoringMs = snapshot.matchScoringMs
        this.phaseTimings = snapshot.phaseTimings
    }
}
