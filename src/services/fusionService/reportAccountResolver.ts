import { FusionAccount } from '../../model/account'
import { SourceService } from '../sourceService'

export function resolveReportAccountId(
    fusionAccount: FusionAccount,
    sources: SourceService
): string | undefined {
    const iscId = fusionAccount.iscAccountId
    if (iscId) return iscId
    const managedKey = fusionAccount.managedAccountId
    if (!managedKey) return undefined
    return sources.resolveIscAccountIdForManagedKey(managedKey)
}

export function resolveReportAccountIdValue(
    accountId: string | undefined,
    sources: SourceService
): string | undefined {
    if (!accountId) return undefined
    return sources.resolveIscAccountIdForManagedKey(accountId)
}
