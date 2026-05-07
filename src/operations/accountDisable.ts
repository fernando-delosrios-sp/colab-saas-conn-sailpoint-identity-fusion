import { ConnectorError, StdAccountDisableInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { processReadOrDisable } from './helpers/readDisableShared'

/**
 * Account disable operation - Disables a fusion account.
 *
 * Disabling does **not** reset unique attribute definitions (`resetDefinition: false`).
 * Existing unique values are preserved during disable. A subsequent enable operation
 * will set `resetDefinition: true`, triggering a full unique attribute regeneration
 * to ensure collision-free values after re-enabling.
 *
 * Processing Flow:
 * 1. SETUP: Load sources and schema
 * 2. REBUILD: Reconstruct the fusion account with refreshed mapped and generated attributes
 * 3. DISABLE: Mark the fusion account as disabled
 * 4. OUTPUT: Generate and return the updated ISC account representation
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 * @param input - SDK input containing the account identity to disable
 */
export const accountDisable = async (serviceRegistry: ServiceRegistry, input: StdAccountDisableInput) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    try {
        await processReadOrDisable(serviceRegistry, input, 'disable')
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        serviceRegistry.log.crash(`Failed to disable account ${input.identity}`, error)
    }
}
