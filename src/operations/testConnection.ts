import { ConnectorError } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'

/**
 * Test connection operation - Validates the connector configuration and connectivity.
 *
 * Invoked by the platform to verify the connector can successfully communicate
 * with its configured services. Returns an empty response on success.
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 * @param _input - Unused input parameter (required by SDK interface)
 */
export const testConnection = async (serviceRegistry: ServiceRegistry, _input: any) => {
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, sources, schemas, messaging, config, res } = serviceRegistry

    try {
        log.info('Testing connection')
        const timer = log.timer()

        // Verify access to the Fusion source and that configured managed sources exist
        await sources.fetchAllSources()
        timer.phase('Verified Fusion source and managed sources')

        sources.validateAccountJmespathFilters()
        timer.phase('Validated Accounts JMESPath filters')

        const delayedAggregationSources = config.sources.filter((sc) => sc.aggregationMode === 'delayed')
        if (delayedAggregationSources.length > 0) {
            await messaging.fetchDelayedAggregationSender()
            log.info(`Delayed aggregation workflow validated for ${delayedAggregationSources.length} source(s)`)
            timer.phase('Validated delayed aggregation workflow')
        }

        const reverseCorrelationSources = config.sources.filter((sc) => sc.correlationMode === 'reverse')
        if (reverseCorrelationSources.length > 0) {
            const schemaAttrNames = await schemas.getManagedSourceSchemaAttributeNames()
            for (const sc of reverseCorrelationSources) {
                await sources.ensureReverseCorrelationSetup(sc, schemaAttrNames)
            }
            log.info(`Reverse correlation setup validated for ${reverseCorrelationSources.length} source(s)`)
            timer.phase('Validated reverse correlation setup')
        }

        res.send({})
        timer.end('✓ Test connection completed')
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash('Failed to test connection', error)
    }
}
