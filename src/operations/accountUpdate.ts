import { ConnectorError, StdAccountUpdateInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { rebuildFusionAccount } from './helpers/rebuildFusionAccount'
import { assert } from '../utils/assert'
import { executeActions } from './actions'
import { ATTR_OPS_NONE } from '../services/attributeService/types'

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
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, sources, schemas, fusion, res } = serviceRegistry

    try {
        log.info(`Updating account: ${input.identity}`)
        assert(input.identity, 'Account identity is required')
        assert(input.changes, 'Account changes are required')
        assert(input.changes.length > 0, 'At least one change is required')
        const timer = log.timer()

        await sources.fetchAllSources()
        await schemas.setFusionAccountSchema(input.schema)
        timer.phase('Step 1: Loading sources and schema')

        const fusionAccount = await rebuildFusionAccount(input.identity, ATTR_OPS_NONE, serviceRegistry)
        assert(fusionAccount, `Fusion account not found for identity: ${input.identity}`)
        log.debug(`Found fusion account: ${fusionAccount.name || fusionAccount.nativeIdentity}`)
        timer.phase('Step 2: Rebuilding fusion account with fresh attributes')

        log.info(`Processing ${input.changes.length} change(s)`)
        for (const change of input.changes) {
            assert(change.attribute, 'Change attribute is required')

            if (change.attribute === 'actions') {
                await executeActions(fusionAccount, change, serviceRegistry)
            } else {
                log.crash(`Unsupported entitlement change: ${change.attribute}`)
            }
        }
        timer.phase(`Step 3: Processing ${input.changes.length} change(s)`)

        const iscAccount = await fusion.getISCAccount(fusionAccount)
        assert(iscAccount, 'Failed to generate ISC account from fusion account')
        timer.phase('Step 4: Generating updated ISC account')

        res.send(iscAccount)
        timer.end(`✓ Account update completed for ${input.identity}`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash(`Failed to update account ${input.identity}`, error)
    }
}
