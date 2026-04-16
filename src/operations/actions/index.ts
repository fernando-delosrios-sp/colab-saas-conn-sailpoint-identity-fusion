import { AttributeChange } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { reportAction } from './reportAction'
import { fusionAction } from './fusionAction'
import { correlateAction } from './correlateAction'
import { reviewerAction } from './reviewerAction'
import { ActionChange } from './types'

export { reportAction, fusionAction, correlateAction }

const ACTION_HANDLERS: Record<
    string,
    (account: FusionAccount, change: ActionChange, registry: ServiceRegistry) => Promise<void>
> = {
    report: reportAction,
    fusion: fusionAction,
    correlated: correlateAction,
    correlate: correlateAction,
    reviewer: reviewerAction,
}

/**
 * Dispatches an action by name to the appropriate handler.
 * Throws via log.crash for unsupported actions.
 */
export async function executeActions(
    account: FusionAccount,
    change: AttributeChange,
    serviceRegistry: ServiceRegistry
): Promise<void> {
    const { log } = serviceRegistry
    const actions = [change.value].flat()
    for (const action of actions) {
        const actionName = action.split(':')[0]
        const handler = ACTION_HANDLERS[actionName]
        if (!handler) {
            log.crash(`Unsupported action: ${actionName}`)
            return
        }
        log.debug(`Executing action: ${actionName}`)
        await handler(account, { op: change.op, value: action }, serviceRegistry)
        log.debug(`${actionName} action completed`)
    }
}
