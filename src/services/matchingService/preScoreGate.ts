import { AccountV2025 as Account } from 'sailpoint-api-client'
import { SourceType } from '../../model/config'
import { FusionAccount } from '../../model/account'
import { SourceInfo } from '../sourceService'
import { getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import type { MatchOutcomeDispatcherDeps, PreScoreOutcome } from './matchOutcomeDispatcher'

export interface PreScoreGateCallbacks {
    isCorrelatedManagedAccountLinkedInFusion(account: Account): boolean
    handleNoReviewerAccount(
        fusionAccount: FusionAccount,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined,
        account: Account
    ): Promise<FusionAccount | undefined>
    handleNonMatch(
        fusionAccount: FusionAccount,
        account: Account,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined
    ): Promise<FusionAccount | undefined>
}

export async function resolveAccountBeforeScoring(
    account: Account,
    deps: MatchOutcomeDispatcherDeps,
    callbacks: PreScoreGateCallbacks
): Promise<PreScoreOutcome> {
    const { run, log, accountAssembly } = deps
    const managedAccountKey = getManagedAccountKeyFromAccount(account)

    if (callbacks.isCorrelatedManagedAccountLinkedInFusion(account)) {
        if (log.getLogLevel() === 'debug') {
            log.debug(
                `Dropping managed account already linked in Fusion from work queue: ${account.name} [${account.sourceName}] (${managedAccountKey ?? 'no-key'}) identityId=${account.identityId}`
            )
        }
        run.claimAccount(managedAccountKey!, account.identityId)
        return { action: 'skip-linked' }
    }

    const sourceInfo = account.sourceName ? run.sourcesByName.get(account.sourceName) : undefined
    const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative

    if (account.sourceName && run.sourcesWithoutReviewers.has(account.sourceName)) {
        const fusionAccount = await accountAssembly.assembleManagedAccount(account)
        const nonMatchAccount = await callbacks.handleNoReviewerAccount(
            fusionAccount,
            sourceType,
            sourceInfo,
            account
        )
        return {
            action: 'non-match',
            resolved: {
                account,
                fusionAccount: nonMatchAccount ?? fusionAccount,
                resolution: 'non-match',
            },
        }
    }

    if (account.uncorrelated === false) {
        if (log.getLogLevel() === 'debug') {
            log.debug(
                `Correlated managed account not linked to Fusion; treating as non-match: ${account.name} [${account.sourceName}] (${managedAccountKey ?? 'no-key'}) identityId=${account.identityId}`
            )
        }
        const fusionAccount = await accountAssembly.assembleManagedAccount(account)
        const orphanIdentityId = account.identityId
        if (orphanIdentityId) {
            const identity = run.getIdentity(orphanIdentityId)
            if (identity && !identity.protected) {
                fusionAccount.addIdentityLayer(identity)
            }
        }
        run.claimAccount(managedAccountKey!, account.identityId)
        const nonMatchAccount = await callbacks.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
        return {
            action: 'non-match',
            resolved: {
                account,
                fusionAccount: nonMatchAccount ?? fusionAccount,
                resolution: 'non-match',
            },
        }
    }

    return { action: 'enqueue' }
}
