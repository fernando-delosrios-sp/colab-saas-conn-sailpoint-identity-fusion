import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { ActionChange } from './types'

/**
 * Correlate action handler - correlates missing source accounts.
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
        // Removing the correlate action does not undo established correlations.
        // It only clears the entitlement on this update response.
        fusionAccount.removeAction('correlated')
        log.debug(`Correlate action removed for account ${fusionAccount.name}`)
    }
}
