import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ATTR_OPS_RESET } from '../../services/definitionService/types'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { assert } from '../../utils/assert'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'
import { ActionChange } from './types'

/**
 * Reset action handler — pre-processes all Fusion accounts to register existing
 * unique values, rebuilds the target Fusion account with `ATTR_OPS_RESET`, and
 * regenerates changeable unique attributes while preserving `nativeIdentity` and `name`.
 */
export const resetAction = async (
    fusionAccount: FusionAccount,
    change: ActionChange,
    serviceRegistry: ServiceRegistry
): Promise<void> => {
    if (change.op !== AttributeChangeOp.Add) return

    const { log, fusion, sources, definition, identities } = serviceRegistry
    const targetIdentity = fusionAccount.managedKey
    assert(targetIdentity, 'Fusion account identity is required for reset')

    await definition.initializeCounters()
    await sources.fetchFusionAccounts()
    definition.registerUniqueValuesFromManagedSourceAccounts(sources.fusionAccounts)
    await fusion.preProcessFusionAccounts()

    const rebuilt = await rebuildFusionAccount(targetIdentity, ATTR_OPS_RESET, {
        fusion,
        identities,
        sources,
        log,
    })
    assert(rebuilt, `Fusion account not found for identity: ${targetIdentity}`)

    await definition.refreshUniqueAttributes(rebuilt)

    for (const key of Object.keys(fusionAccount.attributes)) {
        if (!Object.prototype.hasOwnProperty.call(rebuilt.attributes, key)) {
            delete fusionAccount.attributes[key]
        }
    }
    Object.assign(fusionAccount.attributes, rebuilt.attributes)
}
