import { ConnectorError, StdAccountReadInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { rebuildFusionAccount } from './helpers/rebuildFusionAccount'
import { assert } from '../utils/assert'
import { AttributeOperations } from '../services/attributeService/types'

/**
 * Account read operation - Reads a single fusion account by identity.
 *
 * Rebuilds the fusion account with freshly mapped and generated attributes
 * to ensure the returned data reflects the current state of all source accounts.
 *
 * Processing Flow:
 * 1. SETUP: Load sources and schema
 * 2. REBUILD: Reconstruct the fusion account with refreshed attributes
 * 3. OUTPUT: Generate and return the ISC account representation
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 * @param input - SDK input containing the account identity to read
 */
export const accountRead = async (
    serviceRegistry: ServiceRegistry,
    input: StdAccountReadInput,
) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, fusion, schemas, sources, res } = serviceRegistry

    try {
        log.info(`Reading account: ${input.identity}`)
        assert(input.identity, 'Account identity is required')
        const timer = log.timer()

        await sources.fetchAllSources()
        await schemas.setFusionAccountSchema(input.schema)
        timer.phase('Step 1: Loading sources and schema')

        const attributeOperations: AttributeOperations = {
            refreshMapping: true,
            refreshDefinition: true,
            resetDefinition: false,
        }
        const fusionAccount = await rebuildFusionAccount(input.identity, attributeOperations, serviceRegistry)
        assert(fusionAccount, `Fusion account not found for identity: ${input.identity}`)
        log.debug(`Found fusion account: ${fusionAccount.name || fusionAccount.nativeIdentity}`)
        timer.phase('Step 2: Rebuilding fusion account with fresh attributes')

        const iscAccount = await fusion.getISCAccount(fusionAccount)
        assert(iscAccount, 'Failed to generate ISC account from fusion account')
        timer.phase('Step 3: Generating ISC account')

        res.send(iscAccount)
        timer.end(`✓ Account read completed for ${input.identity}`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash(`Failed to read account ${input.identity}`, error)
    }
}
