import { FusionAccount } from '../../model/account'
import { FusionReportAccount, FusionReportBlend } from './types'

/**
 * AggregationTracker acts as a stateful container for compiling and tracking
 * report metrics, matched accounts, conflicts, and diagnostics during an aggregation run.
 * By encapsulating this state, we keep FusionService stateless and avoid memory leaks.
 */
export class AggregationTracker {
    public matchAccounts: FusionAccount[] = []
    public deferredMatchReportData: FusionReportAccount[] = []
    public analyzedNonMatchReportData: FusionReportAccount[] = []
    public failedMatchingAccounts: FusionReportAccount[] = []
    public conflictingFusionIdentityAccounts: Map<string, Map<string, string>> = new Map()
    public newManagedAccountsCount = 0
    public identitiesProcessedCount = 0
    public fusionBlends: FusionReportBlend[] = []
    public readonly fusionIdentityComparisonsByAccount = new WeakMap<FusionAccount, number>()

    /**
     * Clear all tracked stats to free memory (idempotent).
     */
    public clear(): void {
        this.matchAccounts = []
        this.deferredMatchReportData = []
        this.analyzedNonMatchReportData = []
        this.failedMatchingAccounts = []
        this.conflictingFusionIdentityAccounts.clear()
        this.newManagedAccountsCount = 0
        this.identitiesProcessedCount = 0
        this.fusionBlends = []
    }
}
