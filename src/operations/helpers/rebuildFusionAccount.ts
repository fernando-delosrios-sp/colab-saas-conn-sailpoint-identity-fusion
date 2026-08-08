import { assert } from '../../utils/assert'
import { promiseAllBatched } from '../../services/fusionService/collections'
import { FusionAccount } from '../../model/account'
import { AttributeOperations } from '../../services/definitionService/types'
import { buildManagedAccountKey, parseManagedAccountKey } from '../../model/managedAccountKey'
import { FusionAttribute } from '../../data/schema'
import { toSetFromAttribute as attributeToSet } from '../../utils/attributes'
import { readString } from '../../utils/safeRead'
import { IdentityDocument } from 'sailpoint-api-client'
import type { FusionService } from '../../services/fusionService'
import type { IdentityService } from '../../services/identityService'
import type { SourceService } from '../../services/sourceService'
import type { LogService } from '../../services/logService'
import type { Account } from 'sailpoint-api-client'

interface ParsedAccountKey {
    sourceId: string
    nativeIdentity: string
}

/**
 * Collects all managed account keys that should be fetched for a fusion account.
 * Includes persisted correlated and missing account references, plus accounts
 * linked through the correlated identity for configured managed sources.
 */
function collectManagedAccountKeys(
    fusionAccount: Account,
    identity: IdentityDocument | undefined,
    isManagedSource: (sourceName: string) => boolean
): Set<string> {
    const accountIds = attributeToSet(fusionAccount.attributes, FusionAttribute.Accounts)
    for (const missingId of attributeToSet(fusionAccount.attributes, FusionAttribute.MissingAccounts)) {
        accountIds.add(missingId)
    }

    for (const identityAccount of identity?.accounts ?? []) {
        const sourceName = identityAccount.source?.name
        if (!sourceName || !isManagedSource(sourceName)) continue
        const managedAccountKey = buildManagedAccountKey({
            sourceId: identityAccount.source?.id,
            nativeIdentity: readString(identityAccount, 'accountId'),
        })
        if (managedAccountKey) {
            accountIds.add(managedAccountKey)
        }
    }

    return accountIds
}

/**
 * Parses a collection of managed account keys, warning and skipping any value
 * that is not a valid composite key (`sourceId::nativeIdentity`).
 */
function parseManagedAccountKeys(accountIds: Iterable<string>, log: LogService): ParsedAccountKey[] {
    const parsedKeys: ParsedAccountKey[] = []
    for (const id of accountIds) {
        const parsed = parseManagedAccountKey(id)
        if (!parsed) {
            log.warn(
                `Skipping invalid managed account key during fusion account rebuild (expected sourceId::nativeIdentity): ${id}`
            )
            continue
        }
        parsedKeys.push(parsed)
    }
    return parsedKeys
}

/**
 * Triggers cascade aggregation for the given source IDs when enabled.
 * Logs progress and swallows per-source failures so the rebuild can continue.
 */
async function cascadeAggregateSources(
    sourceIds: Iterable<string>,
    sources: SourceService,
    log: LogService
): Promise<void> {
    const uniqueSourceIds = new Set(sourceIds)
    if (uniqueSourceIds.size === 0) return

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

/**
 * Rebuilds a fusion account by fetching fresh data and reprocessing attributes.
 * Loads the fusion account, its identity, and all linked managed accounts.
 *
 * @param nativeIdentity - The native identity (unique ID) of the fusion account
 * @param attributeOperations - Flags controlling which attribute operations to perform
 * @param services - Object containing the services needed for rebuilding
 * @param triggerCascadeAggregation - Optional flag to trigger cascade aggregation before fetching managed accounts
 * @returns The rebuilt FusionAccount, or undefined if not found
 */
export const rebuildFusionAccount = async (
    nativeIdentity: string,
    attributeOperations: AttributeOperations,
    services: { fusion: FusionService; identities: IdentityService; sources: SourceService; log: LogService },
    triggerCascadeAggregation: boolean = false
): Promise<FusionAccount | undefined> => {
    const { fusion, identities, sources, log } = services

    await sources.fetchFusionAccount(nativeIdentity)
    const fusionAccountsMap = sources.fusionAccountsByNativeIdentity
    assert(fusionAccountsMap, 'Fusion accounts have not been loaded')
    const account = fusionAccountsMap.get(nativeIdentity)
    assert(account, 'Fusion account not found')
    assert(account.identityId, 'Identity ID not found')

    await identities.fetchIdentityById(account.identityId)
    const identity = identities.getIdentityById(account.identityId)

    const accountIds = collectManagedAccountKeys(
        account as unknown as Account,
        identity ?? undefined,
        (sourceName) => !!sources.getSourceByName(sourceName)?.isManaged
    )

    const parsedKeys = parseManagedAccountKeys(accountIds, log)

    if (triggerCascadeAggregation && sources.isCascadeAggregationEnabled) {
        await cascadeAggregateSources(
            parsedKeys.map((key) => key.sourceId),
            sources,
            log
        )
    }

    await promiseAllBatched(parsedKeys, async (parsed) => {
        await sources.fetchManagedAccount(parsed.sourceId, parsed.nativeIdentity)
    })
    return await fusion.processFusionAccount(account, attributeOperations)
}

