import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../model/account'
import { FusionMatch, ManagedAccountAnalysisContext } from './types'
import type {
    DeferredMatchDrainContext,
    MatchOutcomeDispatcherDeps,
    MatchSweepResult,
    ResolvedMatch,
} from './matchOutcomeDispatcher'

export interface AutoMergeCallbacks {
    handleExactMatch(
        fusionAccount: FusionAccount,
        account: Account,
        identityId: string
    ): Promise<FusionAccount | undefined>
    getBestAutoAssignMatch(matches: FusionMatch[]): FusionMatch | undefined
    resolveAutoMergeTargetId(bestMatch?: FusionMatch): string | undefined
}

export interface DeferredMatchResolutionCallbacks extends AutoMergeCallbacks {
    tryAutoMergeIntoDeferredAnchor(
        fusionAccount: FusionAccount,
        account: Account
    ): Promise<FusionAccount | undefined>
    handleDeferredMatch(
        fusionAccount: FusionAccount,
        account: Account,
        remainingInQueue?: Map<string, ManagedAccountAnalysisContext>,
        materializedEarly?: Set<string>,
        sweepResult?: MatchSweepResult
    ): Promise<number>
}

export async function tryAutoMergeFromMatches(
    fusionAccount: FusionAccount,
    account: Account,
    matches: FusionMatch[],
    deps: MatchOutcomeDispatcherDeps,
    callbacks: AutoMergeCallbacks
): Promise<{ assigned: FusionAccount; mergeTargetId: string } | undefined> {
    if (!deps.accountAssembly.isAggregationAccountListMode()) return undefined
    if (!deps.config.fusionEnableAutoMerge) return undefined
    const mergeTargetId = callbacks.resolveAutoMergeTargetId(callbacks.getBestAutoAssignMatch(matches))
    if (!mergeTargetId) return undefined
    const assigned = await callbacks.handleExactMatch(fusionAccount, account, mergeTargetId)
    return assigned ? { assigned, mergeTargetId } : undefined
}

export async function resolveLiveDeferredMatchOutcome(
    fusionAccount: FusionAccount,
    account: Account,
    callbacks: DeferredMatchResolutionCallbacks,
    drainContext?: DeferredMatchDrainContext
): Promise<{ resolved: ResolvedMatch; promotedNonMatches: number }> {
    const assigned = await callbacks.tryAutoMergeIntoDeferredAnchor(fusionAccount, account)
    if (assigned) {
        return {
            resolved: {
                account,
                fusionAccount: assigned,
                resolution: 'exact-match',
            },
            promotedNonMatches: 0,
        }
    }

    const promotedNonMatches = await callbacks.handleDeferredMatch(
        fusionAccount,
        account,
        drainContext?.remainingInQueue,
        drainContext?.materializedEarly,
        drainContext?.sweepResult
    )
    return {
        resolved: {
            account,
            fusionAccount,
            resolution: 'deferred-match',
        },
        promotedNonMatches,
    }
}
