import { ConnectorError } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'

/**
 * Account discover schema operation — dynamically builds the Fusion account schema.
 *
 * Inspects all configured managed source schemas and attribute mapping definitions
 * to construct a unified connector account schema.
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 */
export const accountDiscoverSchema = async (serviceRegistry: ServiceRegistry) => {
    const { log, schemas, sources, res } = serviceRegistry

    try {
        log.info('Discovering account schema')
        const timer = log.timer()

        await sources.fetchAllSources()
        const accountSchema = await schemas.buildDynamicSchema()
        res.send(accountSchema)

        timer.end('✓ Account schema discovery completed')
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash('Failed to discover account schema', error)
    }
}
