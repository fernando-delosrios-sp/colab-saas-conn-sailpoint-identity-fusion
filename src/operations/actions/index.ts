import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { reportAction } from './reportAction'
import { fusionAction } from './fusionAction'
import { correlateAction } from './correlateAction'

export { reportAction, fusionAction, correlateAction }

const ACTION_HANDLERS: Record<string, (account: FusionAccount, op: AttributeChangeOp, registry: ServiceRegistry) => Promise<void>> = {
    report: reportAction,
    fusion: fusionAction,
    correlated: correlateAction,
    correlate: correlateAction,
}

/**
 * Dispatches an action by name to the appropriate handler.
 * Throws via log.crash for unsupported actions.
 */
export async function executeAction(
    actionName: string,
    account: FusionAccount,
    op: AttributeChangeOp,
    serviceRegistry: ServiceRegistry
): Promise<void> {
    const { log } = serviceRegistry
    const handler = ACTION_HANDLERS[actionName]
    if (!handler) {
        log.crash(`Unsupported action: ${actionName}`)
        return
    }
    log.debug(`Executing action: ${actionName}`)
    await handler(account, op, serviceRegistry)
    log.debug(`${actionName} action completed`)
}
