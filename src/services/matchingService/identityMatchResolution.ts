import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../model/account'
import { SourceInfo } from '../sourceService'
import type { MatchOutcomeDispatcherDeps, ResolvedMatch } from './matchOutcomeDispatcher'
import { tryAutoMergeFromMatches, type AutoMergeCallbacks } from './deferredMatchResolution'

export interface IdentityMatchResolutionCallbacks extends AutoMergeCallbacks {
    scorePersistedAnchorsForAutoMerge(fusionAccount: FusionAccount, account: Account): Promise<void>
    handlePartialMatch(
        fusionAccount: FusionAccount,
        sourceInfo: SourceInfo | undefined,
        account: Account
    ): Promise<void>
}

export async function resolveIdentityMatchOutcome(
    fusionAccount: FusionAccount,
    account: Account,
    sourceInfo: SourceInfo | undefined,
    deps: MatchOutcomeDispatcherDeps,
    callbacks: IdentityMatchResolutionCallbacks
): Promise<ResolvedMatch | undefined> {
    if (!deps.accountAssembly.isAggregationAccountListMode()) {
        fusionAccount.clearFusionIdentityReferences()
        return { account, fusionAccount, resolution: 'partial-match' }
    }
    if (deps.config.fusionEnableAutoMerge) {
        await callbacks.scorePersistedAnchorsForAutoMerge(fusionAccount, account)
        fusionAccount.removeDeferredFusionMatches()
    }
    const autoMerge = await tryAutoMergeFromMatches(
        fusionAccount,
        account,
        fusionAccount.fusionMatches,
        deps,
        callbacks
    )
    if (autoMerge) {
        return {
            account,
            fusionAccount: autoMerge.assigned,
            resolution: 'exact-match',
            identityId: autoMerge.mergeTargetId,
        }
    }
    if (
        deps.config.fusionEnableAutoMerge &&
        callbacks.resolveAutoMergeTargetId(callbacks.getBestAutoAssignMatch(fusionAccount.fusionMatches))
    ) {
        return undefined
    }
    await callbacks.handlePartialMatch(fusionAccount, sourceInfo, account)
    return { account, fusionAccount, resolution: 'partial-match' }
}
