import { ConnectorError, StdAccountReadInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { processReadOrDisable } from './helpers/readDisableShared'

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
export const accountRead = async (serviceRegistry: ServiceRegistry, input: StdAccountReadInput) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    try {
        await processReadOrDisable(serviceRegistry, input, 'read')
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        serviceRegistry.log.crash(`Failed to read account ${input.identity}`, error)
    }
}
