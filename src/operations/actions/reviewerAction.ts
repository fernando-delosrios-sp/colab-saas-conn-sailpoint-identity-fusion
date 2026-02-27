import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { assert } from '../../utils/assert'
import { ActionChange } from './types'

/**
 * Reviewer action handler - manages reviewer assignment/removal.
 * @param serviceRegistry - Request-scoped registry (required for concurrent updates to avoid global state)
 */
export const reviewerAction = async (
    fusionAccount: FusionAccount,
    change: ActionChange,
    serviceRegistry: ServiceRegistry
): Promise<void> => {
    const { log } = serviceRegistry

    log.debug(`Reviewer action called for account ${fusionAccount.name} with operation ${change.op}`)

    assert(change.value.startsWith('reviewer:'), `Invalid reviewer action value: ${change.value}`)
    const sourceId = change.value.slice('reviewer:'.length)
    assert(sourceId, `Missing reviewer source id in action value: ${change.value}`)

    if (change.op === AttributeChangeOp.Add) {
        fusionAccount.setSourceReviewer(sourceId)
    } else if (change.op === AttributeChangeOp.Remove) {
        fusionAccount.removeSourceReviewer(sourceId)
    }
}
