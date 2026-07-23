import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount, FusionAccountKind } from './account'
import { SourceInfo } from '../services/sourceService'
import { FusionDecision } from './form'
import { ManagedAccountAnalysisRecorder } from '../services/fusionService/managedAccountAnalysisRecorder'
import { AggregationTracker } from './aggregationTracker'
import { FusionReportBlend } from './fusionReportBlend'
import { LogService } from '../services/logService'
import { FusionConfig } from './config'
import { hasValue, readString, trimStr } from '../utils/safeRead'
import { assert } from '../utils/assert'
import { buildManagedAccountKey } from './managedAccountKey'
import { CandidateRegistry } from '../services/matchingService/candidateRegistry'

export type ManagedAccountInfo = {
    id: string
    name: string
    sourceName: string
    sourceId?: string
    nativeIdentity?: string
}

export function toManagedAccountInfo(account: Account): ManagedAccountInfo {
    return {
        id: account.id ?? '',
        name: account.name ?? '',
        sourceName: account.sourceName ?? '',
        sourceId: account.sourceId,
        nativeIdentity: account.nativeIdentity,
    }
}

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
    managedAccountInventory: Record<string, ManagedAccountInfo>
    formCounters: {
        formsCreated: number
        formInstancesCreated: number
        formsFound: number
        formInstancesFound: number
        answeredFormInstancesProcessed: number
    }
    formDeleteQueue: {
        formsToDelete: string[]
        queuedFormDeleteIds: string[]
    }
    managedAccountProcessing: {
        state: 'idle' | 'initialized'
        startedAt: number
        batchSize: number
    }
    trigramIndexBuilt: boolean
}



/**
 * Run-scoped managed account state:
 * - `managedAccountsById`: mutable work queue; entries removed via `claimAccount()`
 * - `managedAccountInventory`: lightweight metadata for every loaded key until output phase
 */
export class FusionRun {
    public readonly isRecordMode: boolean
    readonly managedAccountsById = new Map<string, Account>()
    readonly managedAccountInventory = new Map<string, ManagedAccountInfo>()
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
    fullScanFallbackCount = 0
    analysisRecorder?: ManagedAccountAnalysisRecorder
    phaseTimings: { phase: string; elapsed: string }[] = []
    private _pendingDisableOperations = new Set<Promise<void>>()
    private _disableOperationFactory?: (account: Account) => Promise<void>
    private readonly _candidateRegistry: CandidateRegistry
    private _tracker?: AggregationTracker
    private _managedAccountProcessingState: 'idle' | 'initialized' = 'idle'
    private _managedAccountProcessingStartedAt: number = 0
    private _managedAccountProcessingBatchSize: number = 0
    trigramIndexByAttribute: Map<string, Map<string, Set<FusionAccount>>> = new Map()
    normalizedCache: WeakMap<FusionAccount, Map<string, string>> = new WeakMap()
    nameNormalizedCache: WeakMap<FusionAccount, Map<string, string>> = new WeakMap()
    indexedMandatoryAttributes: string[] = []
    trigramIndexBuilt: boolean = false
    formsCreated: number = 0
    formInstancesCreated: number = 0
    formsFound: number = 0
    formInstancesFound: number = 0
    answeredFormInstancesProcessed: number = 0
    formsToDelete: Set<string> = new Set()
    formDeleteQueue: string[] = []
    queuedFormDeleteIds: Set<string> = new Set()
    activeFormDeleteWorkers: number = 0
    pendingFormDeleteTasks: Set<Promise<void>> = new Set()

    get autoAssignedCount(): number {
        return this._autoAssignedIdentityIds.size
    }

    get pendingDisableOperationsCount(): number {
        return this._pendingDisableOperations.size
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

    constructor(public log?: LogService, config?: FusionConfig) {
        if (config?.recording?.mode) {
            this.isRecordMode = config.recording.mode === 'record'
        } else if (process.env.RECORD_MODE === 'true') {
            this.isRecordMode = true
        } else {
            this.isRecordMode = false
        }
        this._candidateRegistry = new CandidateRegistry({
            getFusionAccount: (key: string) => this.getFusionAccountByManagedKey(key),
            sourcesByName: this.sourcesByName,
            log: this.log,
        })
    }

    setManagedAccount(accountKey: string, account: Account): void {
        this.managedAccountsById.set(accountKey, account)
        this.managedAccountInventory.set(accountKey, toManagedAccountInfo(account))
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

    hasManagedAccount(accountKey: string): boolean {
        return this.managedAccountInventory.has(accountKey)
    }

    getManagedAccountInfo(accountKey: string): ManagedAccountInfo | undefined {
        return this.managedAccountInventory.get(accountKey)
    }

    clearWorkQueue(): void {
        this.managedAccountsById.clear()
        this.managedAccountsByIdentityId.clear()
    }

    clearManagedAccountState(): void {
        this.clearWorkQueue()
        this.managedAccountInventory.clear()
    }

    /**
     * Register the factory used to fire a disable operation for a managed account.
     * When no factory is registered, {@link queueDisableOperation} is a no-op.
     */
    setDisableOperationFactory(factory: (account: Account) => Promise<void>): void {
        this._disableOperationFactory = factory
    }

    /**
     * Queue a pending asynchronous disable operation for a managed account.
     * The operation is tracked run-locally so it can be awaited before the run completes.
     */
    queueDisableOperation(account: Account): void {
        if (!this._disableOperationFactory) {
            return
        }
        const op = this._disableOperationFactory(account).finally(() => {
            this._pendingDisableOperations.delete(op)
        })
        this._pendingDisableOperations.add(op)
    }

    /**
     * Wait for all pending asynchronous disable operations to complete.
     * Safe to call multiple times; it drains the current pending set.
     */
    async awaitPendingDisableOperations(): Promise<void> {
        if (this._pendingDisableOperations.size === 0) {
            return
        }

        while (this._pendingDisableOperations.size > 0) {
            const pending = Array.from(this._pendingDisableOperations)
            await Promise.allSettled(pending)
        }
    }

    /**
     * Remove a managed account from the match-reporting work queue.
     * No-op when the id is undefined or not present.
     */
    removeMatchAccount(managedAccountId: string | undefined): void {
        if (!managedAccountId) return
        const tracker = this.analysisRecorder?.tracker
        if (!tracker) return
        const idx = tracker.matchAccounts.findIndex((x) => x.managedAccountId === managedAccountId)
        if (idx !== -1) {
            tracker.matchAccounts.splice(idx, 1)
        }
    }

    /**
     * Record a failed match/form outcome through the run's analysis recorder.
     * No-op when no recorder is attached.
     */
    trackFailed(fusionAccount: FusionAccount, message: string): void {
        this.analysisRecorder?.trackFailed(fusionAccount, message)
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

    /**
     * Register a provisional Fusion account as a deferred-match candidate for its source.
     * State is kept run-local so the Match module remains stateless.
     */
    registerDeferredCandidate(fusionAccount: FusionAccount): void {
        this._candidateRegistry.register(fusionAccount)
    }

    /**
     * Clear all run-local deferred-match candidates. Called at the start of each managed-account sweep.
     */
    clearDeferredCandidates(): void {
        this._candidateRegistry.clear()
    }

    /**
     * Iterate over the current-run deferred-match candidates for a source.
     */
    currentRunDeferredCandidatesForSource(sourceName: string | null | undefined): Iterable<FusionAccount> {
        return this._candidateRegistry.queryForSource(sourceName)
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

    /**
     * Iterate fusion accounts without copying the map values into a new array.
     * Use {@link allFusionAccounts} when a mutable array or spread composition is required.
     */
    *fusionAccountsIterable(): Iterable<FusionAccount> {
        yield* this._fusionAccountMap.values()
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

    setTracker(tracker: AggregationTracker): void {
        this._tracker = tracker
    }

    getTracker(): AggregationTracker | undefined {
        return this._tracker
    }

    get managedAccountProcessingState(): 'idle' | 'initialized' {
        return this._managedAccountProcessingState
    }

    get managedAccountProcessingBatchSize(): number {
        return this._managedAccountProcessingBatchSize
    }

    startManagedAccountProcessing(batchSize: number): void {
        this._managedAccountProcessingBatchSize = batchSize
        this._managedAccountProcessingStartedAt = Date.now()
        this._managedAccountProcessingState = 'initialized'
    }

    resetManagedAccountProcessing(): void {
        this._managedAccountProcessingState = 'idle'
        this._managedAccountProcessingStartedAt = 0
        this._managedAccountProcessingBatchSize = 0
    }

    incrementFormsCreated(): void {
        this.formsCreated++
    }

    incrementFormInstancesCreated(): void {
        this.formInstancesCreated++
    }

    incrementFormsFound(): void {
        this.formsFound++
    }

    incrementFormInstancesFound(): void {
        this.formInstancesFound++
    }

    incrementAnsweredFormInstancesProcessed(): void {
        this.answeredFormInstancesProcessed++
    }

    resetFormCounters(): void {
        this.formsCreated = 0
        this.formInstancesCreated = 0
        this.formsFound = 0
        this.formInstancesFound = 0
        this.answeredFormInstancesProcessed = 0
    }

    queueFormForDeletion(formDefId: string): void {
        if (this.queuedFormDeleteIds.has(formDefId)) return
        this.queuedFormDeleteIds.add(formDefId)
        this.formsToDelete.add(formDefId)
        this.formDeleteQueue.push(formDefId)
    }

    isFormQueuedForDeletion(formDefId: string): boolean {
        return this.queuedFormDeleteIds.has(formDefId)
    }

    getNextFormToDelete(): string | undefined {
        return this.formDeleteQueue.shift()
    }

    markFormDeletionComplete(formDefId: string): void {
        this.formsToDelete.delete(formDefId)
        this.queuedFormDeleteIds.delete(formDefId)
        this.activeFormDeleteWorkers--
    }

    async awaitPendingFormDeleteTasks(): Promise<void> {
        await Promise.all(this.pendingFormDeleteTasks)
    }

    resetFormDeletionQueue(): void {
        this.formsToDelete.clear()
        this.formDeleteQueue = []
        this.pendingFormDeleteTasks.clear()
        this.queuedFormDeleteIds.clear()
        this.activeFormDeleteWorkers = 0
    }

    resetFormState(): void {
        this.resetFormCounters()
        this.resetFormDeletionQueue()
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
            managedAccountInventory: Object.fromEntries(this.managedAccountInventory),
            formCounters: {
                formsCreated: this.formsCreated,
                formInstancesCreated: this.formInstancesCreated,
                formsFound: this.formsFound,
                formInstancesFound: this.formInstancesFound,
                answeredFormInstancesProcessed: this.answeredFormInstancesProcessed,
            },
            formDeleteQueue: {
                formsToDelete: Array.from(this.formsToDelete),
                queuedFormDeleteIds: Array.from(this.queuedFormDeleteIds),
            },
            managedAccountProcessing: {
                state: this._managedAccountProcessingState,
                startedAt: this._managedAccountProcessingStartedAt,
                batchSize: this._managedAccountProcessingBatchSize,
            },
            trigramIndexBuilt: this.trigramIndexBuilt,
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
        this.managedAccountInventory.clear()
        const inventoryRecord =
            snapshot.managedAccountInventory ??
            Object.fromEntries(
                Object.entries((snapshot as { managedAccountsAllById?: Record<string, Account> }).managedAccountsAllById ?? {}).map(
                    ([key, account]) => [key, toManagedAccountInfo(account as Account)]
                )
            )
        for (const [key, info] of Object.entries(inventoryRecord)) {
            this.managedAccountInventory.set(key, info as ManagedAccountInfo)
        }
        this.formsCreated = snapshot.formCounters?.formsCreated ?? 0
        this.formInstancesCreated = snapshot.formCounters?.formInstancesCreated ?? 0
        this.formsFound = snapshot.formCounters?.formsFound ?? 0
        this.formInstancesFound = snapshot.formCounters?.formInstancesFound ?? 0
        this.answeredFormInstancesProcessed = snapshot.formCounters?.answeredFormInstancesProcessed ?? 0
        this.formsToDelete = new Set(snapshot.formDeleteQueue?.formsToDelete ?? [])
        this.queuedFormDeleteIds = new Set(snapshot.formDeleteQueue?.queuedFormDeleteIds ?? [])
        this.formDeleteQueue = snapshot.formDeleteQueue?.formsToDelete ?? []
        this.pendingFormDeleteTasks.clear()
        this.activeFormDeleteWorkers = 0
        this._managedAccountProcessingState = snapshot.managedAccountProcessing?.state ?? 'idle'
        this._managedAccountProcessingStartedAt = snapshot.managedAccountProcessing?.startedAt ?? 0
        this._managedAccountProcessingBatchSize = snapshot.managedAccountProcessing?.batchSize ?? 0
        this.trigramIndexBuilt = snapshot.trigramIndexBuilt ?? false
    }
}

