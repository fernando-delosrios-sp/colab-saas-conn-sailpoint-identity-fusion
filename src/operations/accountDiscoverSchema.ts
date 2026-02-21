import { ConnectorError } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'

export const accountDiscoverSchema = async (
    serviceRegistry: ServiceRegistry,
) => {
    ServiceRegistry.setCurrent(serviceRegistry)
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
