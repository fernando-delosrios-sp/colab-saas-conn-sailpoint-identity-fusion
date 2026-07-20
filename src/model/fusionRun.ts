import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount } from './account'
import { SourceInfo } from '../services/sourceService'
import { FusionDecision } from './form'
import { ManagedAccountAnalysisRecorder } from '../services/fusionService/managedAccountAnalysisRecorder'
import { AggregationTracker } from '../services/fusionService/aggregationTracker'
import { FusionReportBlend } from '../services/fusionService/types'

export interface RunStateSnapshot {
    managedAccounts: Record<string, any>[]
    fusionAccounts: Record<string, any>[]
    identities: Record<string, any>[]
    formDecisions: Record<string, any>[]
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
    linkedAccountKeyIndex: Set<string> | undefined
    formDecisions: FusionDecision[] = []
    fusionBlends: FusionReportBlend[] = []
    matchScoringMs = 0
    analysisRecorder?: ManagedAccountAnalysisRecorder
    tracker?: AggregationTracker
    phaseTimings: { phase: string; elapsed: string }[] = []
    managedSources: SourceInfo[] = []
    managedAccountsAllById?: Map<string, Account>

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

    snapshot(): RunStateSnapshot {
        return {
            managedAccounts: Array.from(this.managedAccountsById.values()),
            fusionAccounts: Array.from(this.fusionAccountMap.values()),
            identities: Array.from(this.identityMap.values()),
            formDecisions: this.formDecisions,
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
        this.formDecisions = snapshot.formDecisions as FusionDecision[]
        this.autoAssignedIdentityIds.clear()
        for (const id of snapshot.autoAssignedIds) {
            this.autoAssignedIdentityIds.add(id)
        }
        this.matchScoringMs = snapshot.matchScoringMs
        this.phaseTimings = snapshot.phaseTimings
    }
}
