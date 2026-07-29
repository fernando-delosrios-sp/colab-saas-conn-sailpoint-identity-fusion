import { ConnectorError, StdAccountUpdateInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { runAccountUpdatePipeline } from './helpers/accountUpdateHelpers'

/**
 * Account update operation - Applies entitlement changes (actions) to a fusion account.
 *
 * Processes attribute changes from the platform, currently supporting action-type
 * entitlements: report, fusion, and correlate. Each action is executed sequentially
 * against the rebuilt fusion account.
 *
 * Processing Flow:
 * 1. SETUP: Load sources and schema
 * 2. REBUILD: Reconstruct the fusion account with refreshed attributes
 * 3. ACTIONS: Process each change by executing the corresponding action handler
 * 4. OUTPUT: Generate and return the updated ISC account representation
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 * @param input - SDK input containing the account identity and list of attribute changes
 */
export const accountUpdate = async (serviceRegistry: ServiceRegistry, input: StdAccountUpdateInput) => {
    const { log } = serviceRegistry
    let accountLabel = input.identity

    try {
        accountLabel = await runAccountUpdatePipeline(serviceRegistry, input)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash(`Failed to update account ${accountLabel}`, error)
    }
}
