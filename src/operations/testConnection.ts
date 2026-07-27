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
    const { log, sources, schemas, workflows, res } = serviceRegistry

    try {
        log.detail({ action: 'testing connection' })

        log.stepStart('verify-sources')
        await sources.fetchAllSources()
        log.stepEnd('verify-sources')

        log.stepStart('validate-jmespath')
        sources.validateAccountJmespathFilters()
        log.stepEnd('validate-jmespath')

        if (sources.isEmailWorkflowConfigured()) {
            log.stepStart('validate-email-workflow')
            await workflows.fetchSender()
            log.stepEnd('validate-email-workflow')
        }

        const delayedAggregationSources = sources.delayedAggregationSources
        if (delayedAggregationSources.length > 0) {
            log.stepStart('validate-delayed-aggregation-workflow')
            await workflows.fetchDelayedAggregationSender()
            log.stepEnd('validate-delayed-aggregation-workflow', { sources: delayedAggregationSources.length })
        }

        const reverseCorrelationSources = sources.reverseCorrelationSources
        if (reverseCorrelationSources.length > 0) {
            log.stepStart('validate-reverse-correlation')
            const schemaAttrNames = await schemas.getManagedSourceSchemaAttributeNames()
            for (const sc of reverseCorrelationSources) {
                try {
                    await sources.ensureReverseCorrelationSetup(sc, schemaAttrNames)
                } catch (error) {
                    log.error(
                        `Reverse correlation setup validation failed for source "${sc.name}" (attribute="${sc.correlationAttribute ?? 'unset'}"): ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    )
                    throw error
                }
            }
            log.stepEnd('validate-reverse-correlation', { sources: reverseCorrelationSources.length })
        }

        res.send({})
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash('Failed to test connection', error)
    }
}
