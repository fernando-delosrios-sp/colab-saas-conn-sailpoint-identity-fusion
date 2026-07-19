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

export class FusionRun {
    readonly managedAccountsById = new Map<string, Account>()
    readonly managedAccountsByIdentityId = new Map<string, Account[]>()
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
