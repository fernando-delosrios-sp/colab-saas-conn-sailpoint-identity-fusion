import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { assert } from '../../utils/assert'
import { ActionChange } from './types'

/**
 * Correlate action handler — on Add, correlates missing managed source accounts (ISC PATCH).
 * Remove is invalid: the correlated entitlement is derived from missing-accounts state.
 * @param serviceRegistry - Request-scoped registry (required for concurrent updates to avoid global state)
 */
export const correlateAction = async (
    fusionAccount: FusionAccount,
    change: ActionChange,
    serviceRegistry: ServiceRegistry
): Promise<void> => {
    const { log, fusion } = serviceRegistry

    log.debug(`Correlate action called for account ${fusionAccount.name} with operation ${change.op}`)

    if (change.op === AttributeChangeOp.Add) {
        await fusion.correlateMissingAccountsPerSource(fusionAccount)
    } else if (change.op === AttributeChangeOp.Remove) {
        assert(false, `Correlated entitlement cannot be removed: ${change.value}`)
    }
}
