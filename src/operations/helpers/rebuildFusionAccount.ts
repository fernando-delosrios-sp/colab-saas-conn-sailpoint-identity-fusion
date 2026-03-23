import { ServiceRegistry } from '../../services/serviceRegistry'
import { assert } from '../../utils/assert'
import { FusionAccount } from '../../model/account'
import { AttributeOperations } from '../../services/attributeService/types'

/**
 * Rebuilds a fusion account by fetching fresh data and reprocessing attributes.
 * Loads the fusion account, its identity, and all linked managed accounts.
 *
 * @param nativeIdentity - The native identity (unique ID) of the fusion account
 * @param attributeOperations - Flags controlling which attribute operations to perform
 * @param serviceRegistry - Optional; defaults to ServiceRegistry.getCurrent() if omitted
 * @returns The rebuilt FusionAccount, or undefined if not found
 */
export const rebuildFusionAccount = async (
    nativeIdentity: string,
    attributeOperations: AttributeOperations,
    serviceRegistry?: ServiceRegistry
): Promise<FusionAccount | undefined> => {
    if (!serviceRegistry) {
        serviceRegistry = ServiceRegistry.getCurrent()
    }
    const { fusion, identities, sources } = serviceRegistry

    await sources.fetchFusionAccount(nativeIdentity)
    const fusionAccountsMap = sources.fusionAccountsByNativeIdentity
    assert(fusionAccountsMap, 'Fusion accounts have not been loaded')
    const account = fusionAccountsMap.get(nativeIdentity)
    assert(account, 'Fusion account not found')
    assert(account.identityId, 'Identity ID not found')
    await identities.fetchIdentityById(account.identityId)
    const accountIds = new Set<string>(account.attributes?.accounts ?? [])
    const identity = identities.getIdentityById(account.identityId)
    for (const identityAccount of identity?.accounts ?? []) {
        const sourceName = identityAccount.source?.name
        if (identityAccount.id && sourceName && sources.getSourceByName(sourceName)?.isManaged) {
            accountIds.add(identityAccount.id)
        }
    }
    await Promise.all(
        Array.from(accountIds).map(async (id: string) => {
            await sources.fetchManagedAccount(id)
        })
    )
    return await fusion.processFusionAccount(account, attributeOperations)
}
