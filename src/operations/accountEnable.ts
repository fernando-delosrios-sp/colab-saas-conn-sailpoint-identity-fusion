import { ConnectorError, StdAccountEnableInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { rebuildFusionAccount } from './helpers/rebuildFusionAccount'
import { assert } from '../utils/assert'
import { ATTR_OPS_RESET } from '../services/definitionService/types'

/**
 * Account enable operation - Re-enables a previously disabled fusion account.
 *
 * Enabling triggers a full unique attribute reset (`resetDefinition: true`).
 * All unique attribute values (e.g. usernames, generated IDs) are unregistered
 * and regenerated to guarantee collision-free values. Use regular unique attribute
 * schemas to define changeable attributes that should be refreshed on
 * enable/disable cycles. The nativeIdentity and account name are never changed
 * (see {@link processNormalDefinition} and {@link processUniqueDefinition}).
 *
 * Unlike disable, enable requires pre-processing all fusion accounts to collect
 * unique attribute values before rebuilding, since re-enabling may require
 * reassigning unique identifiers that were released during disable.
 *
 * Processing Flow:
 * 1. SETUP: Load sources and schema
 * 2. PRE-PROCESS: Fetch and pre-process all fusion accounts to collect unique values
 * 3. REBUILD: Reconstruct the target fusion account with refreshed and reset attributes
 * 4. ENABLE: Mark the fusion account as enabled
 * 5. OUTPUT: Generate and return the updated ISC account representation
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 * @param input - SDK input containing the account identity to enable
 */
export const accountEnable = async (serviceRegistry: ServiceRegistry, input: StdAccountEnableInput) => {
    const { log, fusion, sources, schemas, definition, res, identities } = serviceRegistry

    try {
        log.detail({ identity: input.identity, action: 'enabling account' })
        assert(input.identity, 'Account identity is required')
        const timer = log.timer()

        log.stepStart('load-sources-schema')
        await definition.initializeCounters()
        await sources.fetchAllSources()
        await schemas.setFusionAccountSchema(input.schema)
        log.stepEnd('load-sources-schema')

        log.stepStart('preprocess-fusion-accounts')
        await sources.fetchFusionAccounts()
        definition.registerUniqueValuesFromManagedSourceAccounts(sources.fusionAccounts)
        const preProcessOp = log.track('FusionService.preProcessFusionAccounts')
        const preProcessedAccounts = await fusion.preProcessFusionAccounts()
        preProcessOp.done({ count: preProcessedAccounts.length })
        log.stepEnd('preprocess-fusion-accounts', { count: preProcessedAccounts.length })

        log.stepStart('rebuild-fusion-account')
        const fusionAccount = await rebuildFusionAccount(input.identity, ATTR_OPS_RESET, {
            fusion,
            identities,
            sources,
            log,
        })
        assert(fusionAccount, `Fusion account not found for identity: ${input.identity}`)
        log.debug(`Found fusion account: ${fusionAccount.name || fusionAccount.managedKey}`)

        await definition.refreshUniqueAttributes(fusionAccount)
        log.stepEnd('rebuild-fusion-account')

        log.stepStart('enable-fusion-account')
        fusionAccount.enable()
        log.stepEnd('enable-fusion-account')

        log.stepStart('generate-account')
        await fusion.normalizePendingFormStateForOutput()
        const iscAccount = await fusion.getISCAccount(fusionAccount)
        assert(iscAccount, 'Failed to generate ISC account from fusion account')
        log.stepEnd('generate-account')

        res.send(iscAccount)
        timer.end(`✓ Account enable completed for ${input.identity}`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash(`Failed to enable account ${input.identity}`, error)
    }
}
