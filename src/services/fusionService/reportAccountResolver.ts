import { FusionAccount } from '../../model/account'
import { FusionRun } from '../../model/fusionRun'
import { isCompositeManagedAccountKey } from '../../model/managedAccountKey'
import { trimStr } from '../../utils/safeRead'
import { SourceService } from '../sourceService'

export function isReportableIscAccountId(value: string | undefined | null): value is string {
    const id = trimStr(value)
    return id !== undefined && !isCompositeManagedAccountKey(id)
}

export function resolveReportAccountId(
    fusionAccount: FusionAccount,
    sources: SourceService
): string | undefined {
    const iscId = trimStr(fusionAccount.iscAccountId)
    if (isReportableIscAccountId(iscId)) return iscId
    const managedKey = fusionAccount.managedAccountId
    if (!managedKey) return undefined
    const resolved = trimStr(sources.resolveIscAccountIdForManagedKey(managedKey))
    return isReportableIscAccountId(resolved) ? resolved : undefined
}

export function resolveReportAccountIdValue(
    accountId: string | undefined,
    sources: SourceService
): string | undefined {
    if (!accountId) return undefined
    const resolved = trimStr(sources.resolveIscAccountIdForManagedKey(accountId))
    return isReportableIscAccountId(resolved) ? resolved : undefined
}

/**
 * Resolve the ISC account id used for human-account report links.
 * Mirrors the Fusion Reviews (`accounts`) section, which uses {@link resolveReportAccountId}.
 */
export function resolveManagedAccountIscIdForReport(
    managedKey: string | undefined,
    sources: SourceService,
    run: FusionRun,
    options?: {
        storedIscAccountId?: string
        identityId?: string
        fusionAccounts?: Iterable<FusionAccount>
    }
): string | undefined {
    const storedId = trimStr(options?.storedIscAccountId)
    if (isReportableIscAccountId(storedId)) return storedId

    if (!managedKey) return undefined

    const fromSources = trimStr(sources.resolveIscAccountIdForManagedKey(managedKey))
    if (isReportableIscAccountId(fromSources)) return fromSources

    const inventoryId = trimStr(run.getManagedAccountInfo(managedKey)?.id)
    if (isReportableIscAccountId(inventoryId)) return inventoryId

    const fusionByKey = run.getFusionAccountByManagedKey?.(managedKey)
    const fusionByIdentity = options?.identityId ? run.getFusionIdentity?.(options.identityId) : undefined
    for (const fusionAccount of [fusionByKey, fusionByIdentity]) {
        const resolved = fusionAccount ? resolveReportAccountId(fusionAccount, sources) : undefined
        if (isReportableIscAccountId(resolved)) return resolved
    }

    if (options?.fusionAccounts) {
        for (const fusionAccount of options.fusionAccounts) {
            if (fusionAccount.managedKey === managedKey) {
                const resolved = resolveReportAccountId(fusionAccount, sources)
                if (isReportableIscAccountId(resolved)) return resolved
            }
        }
    }

    if (run.allFusionAccounts) {
        for (const fusionAccount of run.allFusionAccounts) {
            if (fusionAccount.managedKey === managedKey) {
                const resolved = resolveReportAccountId(fusionAccount, sources)
                if (isReportableIscAccountId(resolved)) return resolved
            }
        }
    }

    if (run.allFusionIdentities) {
        for (const fusionAccount of run.allFusionIdentities) {
            if (fusionAccount.managedKey === managedKey) {
                const resolved = resolveReportAccountId(fusionAccount, sources)
                if (isReportableIscAccountId(resolved)) return resolved
            }
        }
    }

    return undefined
}
