import { ConnectorError, ConnectorErrorType, StdEntitlementListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'

/**
 * Entitlement list operation - Lists available entitlements by type.
 *
 * Supports two entitlement types:
 * - "status": Returns static status entitlements (no API calls needed)
 * - "action": Returns action entitlements based on configured sources (requires source fetch)
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 * @param input - SDK input containing the entitlement type to list
 */
export const entitlementList = async (serviceRegistry: ServiceRegistry, input: StdEntitlementListInput) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, sources, entitlements, res } = serviceRegistry

    try {
        log.info(`Listing entitlements for type: ${input.type}`)
        const timer = log.timer()

        switch (input.type) {
            case 'status':
                entitlements.listStatusEntitlements().forEach((x) => res.send(x))
                break
            case 'action':
                await sources.fetchAllSources()
                entitlements.listActionEntitlements().forEach((x) => res.send(x))
                break
            default:
                throw new ConnectorError(`Invalid entitlement type ${input.type}`, ConnectorErrorType.Generic)
        }

        timer.end(`✓ Entitlement list completed for type: ${input.type}`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash(`Failed to list entitlements for type ${input.type}`, error)
    }
}
