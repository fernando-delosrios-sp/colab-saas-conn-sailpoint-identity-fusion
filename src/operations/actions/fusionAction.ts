import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { ActionChange } from './types'

/**
 * Fusion action handler - manages fusion account creation/removal.
 * @param serviceRegistry - Request-scoped registry (required for concurrent updates to avoid global state)
 */
export const fusionAction = async (
    fusionAccount: FusionAccount,
    change: ActionChange,
    serviceRegistry: ServiceRegistry
): Promise<void> => {
    const { log } = serviceRegistry

    log.debug(`Fusion action called for account ${fusionAccount.name} with operation ${change.op}`)

    if (change.op === AttributeChangeOp.Add) {
        fusionAccount.addAction('fusion')
    } else if (change.op === AttributeChangeOp.Remove) {
        fusionAccount.removeAction('fusion')
    }
}
