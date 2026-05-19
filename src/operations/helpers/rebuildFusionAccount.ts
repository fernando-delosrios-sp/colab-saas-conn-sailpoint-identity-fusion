import { assert } from '../../utils/assert'
import { promiseAllBatched } from '../../services/fusionService/collections'
import { FusionAccount } from '../../model/account'
import { AttributeOperations } from '../../services/attributeService/types'
import { buildManagedAccountKey, parseManagedAccountKey } from '../../model/managedAccountKey'
import { readString } from '../../utils/safeRead'
import type { FusionService } from '../../services/fusionService'
import type { IdentityService } from '../../services/identityService'
import type { SourceService } from '../../services/sourceService'
import type { LogService } from '../../services/logService'

interface ParsedAccountKey {
    sourceId: string
    nativeIdentity: string
}

/**
 * Rebuilds a fusion account by fetching fresh data and reprocessing attributes.
 * Loads the fusion account, its identity, and all linked managed accounts.
 *
 * @param nativeIdentity - The native identity (unique ID) of the fusion account
 * @param attributeOperations - Flags controlling which attribute operations to perform
 * @param services - Object containing the services needed for rebuilding
 * @returns The rebuilt FusionAccount, or undefined if not found
 */
export const rebuildFusionAccount = async (
    nativeIdentity: string,
    attributeOperations: AttributeOperations,
    services: { fusion: FusionService; identities: IdentityService; sources: SourceService; log: LogService }
): Promise<FusionAccount | undefined> => {
    const { fusion, identities, sources, log } = services

    await sources.fetchFusionAccount(nativeIdentity)
    const fusionAccountsMap = sources.fusionAccountsByNativeIdentity
    assert(fusionAccountsMap, 'Fusion accounts have not been loaded')
    const account = fusionAccountsMap.get(nativeIdentity)
    assert(account, 'Fusion account not found')
    assert(account.identityId, 'Identity ID not found')
    await identities.fetchIdentityById(account.identityId)
    const accountIds = new Set<string>([
        ...(account.attributes?.accounts ?? []),
        ...(account.attributes?.['missing-accounts'] ?? []),
    ])
    const identity = identities.getIdentityById(account.identityId)
    for (const identityAccount of identity?.accounts ?? []) {
        const sourceName = identityAccount.source?.name
        if (!sourceName || !sources.getSourceByName(sourceName)?.isManaged) continue
        const managedAccountKey = buildManagedAccountKey({
            sourceId: identityAccount.source?.id,
            nativeIdentity: readString(identityAccount, 'accountId'),
        })
        if (managedAccountKey) {
            accountIds.add(managedAccountKey)
        }
    }

    const parsedKeys: ParsedAccountKey[] = []
    for (const id of accountIds) {
        const parsed = parseManagedAccountKey(id)
        if (!parsed) {
            log.warn(`Skipping legacy non-composite managed account reference during fusion account rebuild: ${id}`)
            continue
        }
        parsedKeys.push(parsed)
    }

    const cascadeEnabled = sources.isCascadeAggregationEnabled
    const uniqueSourceIds = new Set(parsedKeys.map((k) => k.sourceId))

    if (cascadeEnabled && uniqueSourceIds.size > 0) {
        log.info(
            `Cascade aggregation enabled: triggering aggregation for ${uniqueSourceIds.size} source(s) before fetching managed accounts`
        )
        await promiseAllBatched(Array.from(uniqueSourceIds), async (sourceId) => {
            const sourceInfo = sources.getSourceById(sourceId)
            if (!sourceInfo?.isManaged) return
            const disableOptimization = sourceInfo?.config?.optimizedAggregation === false
            log.info(`Cascade: aggregating managed source ${sourceInfo.name ?? sourceId}`)
            try {
                await sources.aggregateManagedSource(sourceId, disableOptimization)
            } catch (error) {
                log.error(
                    `Cascade aggregation failed for source ${sourceInfo.name ?? sourceId}: ${error instanceof Error ? error.message : String(error)}. Continuing with main process.`
                )
            }
        })
    }

    await promiseAllBatched(parsedKeys, async (parsed) => {
        await sources.fetchManagedAccount(parsed.sourceId, parsed.nativeIdentity)
    })
    return await fusion.processFusionAccount(account, attributeOperations)
}
