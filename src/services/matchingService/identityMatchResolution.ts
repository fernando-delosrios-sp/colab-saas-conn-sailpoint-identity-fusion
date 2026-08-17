import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../model/account'
import { SourceInfo } from '../sourceService'
import type { MatchOutcomeDispatcherDeps, ResolvedMatch } from './matchOutcomeDispatcher'
import { tryAutoMergeFromMatches, type AutoMergeCallbacks } from './deferredMatchResolution'
import { sourceManualReviewPathAvailable } from './reviewerAvailability'

export interface IdentityMatchResolutionCallbacks extends AutoMergeCallbacks {
    scorePersistedAnchorsForAutoMerge(fusionAccount: FusionAccount, account: Account): Promise<void>
    handlePartialMatch(
        fusionAccount: FusionAccount,
        sourceInfo: SourceInfo | undefined,
        account: Account
    ): Promise<void>
    handleAuthoritativeNonMatch(
        fusionAccount: FusionAccount,
        account: Account,
        sourceInfo: SourceInfo | undefined
    ): Promise<ResolvedMatch>
}

export async function resolveIdentityMatchOutcome(
    fusionAccount: FusionAccount,
    account: Account,
    sourceInfo: SourceInfo | undefined,
    deps: MatchOutcomeDispatcherDeps,
    callbacks: IdentityMatchResolutionCallbacks
): Promise<ResolvedMatch | undefined> {
    if (!deps.accountAssembly.isAggregationAccountListMode()) {
        fusionAccount.layers.clearFusionIdentityReferences()
        return { account, fusionAccount, resolution: 'partial-match' }
    }
    if (deps.config.fusionEnableAutoMerge) {
        await callbacks.scorePersistedAnchorsForAutoMerge(fusionAccount, account)
    }
    const autoMerge = await tryAutoMergeFromMatches(
        fusionAccount,
        account,
        fusionAccount.fusionMatches,
        deps,
        callbacks
    )
    const hadMergeTarget =
        deps.config.fusionEnableAutoMerge &&
        !!callbacks.resolveAutoMergeTargetId(callbacks.getBestAutoAssignMatch(fusionAccount.fusionMatches))
    if (deps.config.fusionEnableAutoMerge) {
        fusionAccount.layers.removeDeferredFusionMatches()
    }
    if (autoMerge) {
        return {
            account,
            fusionAccount: autoMerge.assigned,
            resolution: 'exact-match',
            identityId: autoMerge.mergeTargetId,
        }
    }
    if (sourceManualReviewPathAvailable(deps.config, sourceInfo, deps.run)) {
        if (hadMergeTarget) {
            return undefined
        }
        await callbacks.handlePartialMatch(fusionAccount, sourceInfo, account)
        return { account, fusionAccount, resolution: 'partial-match' }
    }
    return callbacks.handleAuthoritativeNonMatch(fusionAccount, account, sourceInfo)
}
