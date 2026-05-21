import { Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../model/account'
import { SourceInfo } from '../sourceService'
import { SourceType } from '../../model/config'
import { FusionConfig } from '../../model/config'
import { buildManagedAccountKey, getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { hasIdentityBackedMatches, hasNewUnmatchedPeerMatches } from './helpers'

export interface FusionManagedAccountState {
    config: FusionConfig
    isAggregationAccountListMode: boolean
    sourcesByName: Map<string, SourceInfo>
    sourcesWithoutReviewers: Set<string>
    isCorrelatedManagedAccountLinkedInFusion: (account: Account) => boolean
    removeManagedAccountFromWorkQueue: (account: Account) => void
    preProcessManagedAccount: (account: Account) => Promise<FusionAccount>
    analyzeManagedAccount: (account: Account) => Promise<FusionAccount>
    handleNoReviewerAccount: (account: Account, sourceType: SourceType, sourceInfo?: SourceInfo) => Promise<FusionAccount | undefined>
    handleNonMatch: (fusionAccount: FusionAccount, account: Account, sourceType: SourceType, sourceInfo?: SourceInfo) => Promise<FusionAccount | undefined>
    handleExactMatch: (fusionAccount: FusionAccount, account: Account, identityId: string) => Promise<FusionAccount | undefined>
    handlePartialMatch: (fusionAccount: FusionAccount, sourceInfo?: SourceInfo) => Promise<FusionAccount | undefined>
    handleDeferredMatch: (fusionAccount: FusionAccount, account: Account) => FusionAccount | undefined
    logInfo: (message: string) => void
}

export async function processManagedAccount(
    state: FusionManagedAccountState,
    account: Account
): Promise<FusionAccount | undefined> {
    const managedAccountKey = getManagedAccountKeyFromAccount(account)

    if (state.isCorrelatedManagedAccountLinkedInFusion(account)) {
        state.logInfo(
            `Dropping managed account already linked in Fusion from work queue: ${account.name} [${account.sourceName}] (${managedAccountKey ?? 'no-key'}) identityId=${account.identityId}`
        )
        state.removeManagedAccountFromWorkQueue(account)
        return undefined
    }

    // Resolve source context once — shared by all downstream paths.
    const sourceInfo = account.sourceName ? state.sourcesByName.get(account.sourceName) : undefined
    const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative

    if (account.sourceName && state.sourcesWithoutReviewers.has(account.sourceName)) {
        return state.handleNoReviewerAccount(account, sourceType, sourceInfo)
    }

    // Correlated on the source but not linked to any loaded Fusion row — treat as non-match.
    if (account.uncorrelated === false) {
        state.logInfo(
            `Correlated managed account not linked to Fusion; treating as non-match: ${account.name} [${account.sourceName}] (${managedAccountKey ?? 'no-key'}) identityId=${account.identityId}`
        )
        const fusionAccount = await state.preProcessManagedAccount(account)
        state.removeManagedAccountFromWorkQueue(account)
        return state.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
    }

    const fusionAccount = await state.analyzeManagedAccount(account)
    const identityBackedMatches = hasIdentityBackedMatches(fusionAccount)
    const newUnmatchedPeerMatches = hasNewUnmatchedPeerMatches(fusionAccount)

    if (identityBackedMatches) {
        // Analysis-only runs (e.g. custom:dryrun): keep match report data but do not
        // register decisions or mutate fusion state as in a real aggregation.
        if (!state.isAggregationAccountListMode) {
            fusionAccount.clearFusionIdentityReferences()
            return undefined
        }
        const perfectMatch = fusionAccount.fusionMatches.find(hasAllAttributeScoresPerfect)
        if (state.config.fusionMergingExactMatch && perfectMatch?.identityId) {
            return state.handleExactMatch(fusionAccount, account, perfectMatch.identityId)
        }
        return await state.handlePartialMatch(fusionAccount, sourceInfo)
    }

    if (newUnmatchedPeerMatches) {
        return state.handleDeferredMatch(fusionAccount, account)
    }

    return state.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
}

/**
 * Returns true when every configured rule was evaluated (none skipped) and scored 100.
 * Excludes synthetic combined rows (`weighted-mean` / legacy `average`).
 */
export function hasAllAttributeScoresPerfect(match: any): boolean {
    return isExactAttributeMatchScores(match.scores)
}
