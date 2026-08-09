import { AttributeChangeOp, ConnectorError, StdAccountCreateInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { StatusEntitlement } from '../model/statusEntitlement'
import { FusionAttribute } from '../data/schema'
import { assert } from '../utils/assert'
import { normalizeActionTokens } from '../utils/attributes'
import { resolveIdentityNameFromCreateInput } from '../utils/identityName'
import { executeActions } from './actions'

/**
 * Account create operation - Creates a new fusion account for an identity.
 *
 * The nativeIdentity and account name are determined at creation time and become
 * immutable for the lifetime of the account. Subsequent updates, reads, and
 * enable/disable cycles will never modify them, preventing disconnection between
 * the Fusion account and the platform and protecting the hosting identity.
 *
 * Processing Flow:
 * 1. SETUP: Load sources, schema, fetch target identity
 * 2. LOAD: Fetch all fusion accounts and register unique attribute values for collision detection
 * 3. PROCESS: Create/update fusion account, refresh unique attributes, execute actions
 * 4. OUTPUT: Generate and return the ISC account representation
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 * @param input - SDK input containing the identity name and requested actions
 */
export const accountCreate = async (serviceRegistry: ServiceRegistry, input: StdAccountCreateInput) => {
    const { log, identities, sources, schemas, fusion, definition, res } = serviceRegistry

    let identityName: string | undefined
    try {
        assert(input.schema, 'Account schema is required')

        await sources.fetchAllSources()
        await schemas.setFusionAccountSchema(input.schema)
        const { fusionDisplayAttribute } = schemas
        assert(fusionDisplayAttribute, 'Fusion display attribute not found in schema')

        identityName = resolveIdentityNameFromCreateInput(input, fusionDisplayAttribute)
        assert(identityName, 'Identity name is required for account creation')

        log.detail({ identity: identityName, action: 'creating account' })
        const timer = log.timer()

        log.stepStart('fetch-identity')
        const identity = await identities.fetchIdentityByName(identityName)
        assert(identity, `Identity not found: ${identityName}`)
        assert(identity.id, `Identity ID is missing for: ${identityName}`)
        log.stepEnd('fetch-identity')

        log.stepStart('load-fusion-accounts')
        await sources.fetchFusionAccounts()
        await definition.initializeCounters()
        definition.registerUniqueValuesFromManagedSourceAccounts(sources.fusionAccounts)
        const preProcessOp = log.track('FusionService.preProcessFusionAccounts')
        const preProcessedAccounts = await fusion.preProcessFusionAccounts()
        preProcessOp.done({ count: preProcessedAccounts.length })
        log.stepEnd('load-fusion-accounts', { count: preProcessedAccounts.length })

        log.stepStart('process-identity')
        await fusion.processIdentity(identity)

        const fusionIdentity = fusion.getFusionIdentity(identity.id)
        assert(fusionIdentity, `Fusion identity not found for identity ID: ${identity.id}`)
        log.debug(`Found fusion identity: ${fusionIdentity.managedKey}`)
        fusionIdentity.collections.statuses.add(StatusEntitlement.Requested, 'Status set by accountCreate operation')

        await definition.refreshUniqueAttributes(fusionIdentity)
        log.stepEnd('process-identity')

        const actions = normalizeActionTokens(input.attributes.actions)
        log.stepStart('execute-actions', { count: actions.length })
        for (const action of actions) {
            await executeActions(
                fusionIdentity,
                { op: AttributeChangeOp.Add, attribute: FusionAttribute.Actions, value: action },
                serviceRegistry
            )
        }
        log.stepEnd('execute-actions', { count: actions.length })

        log.stepStart('generate-account')
        await fusion.normalizePendingFormStateForOutput()
        const iscAccount = await fusion.getISCAccount(fusionIdentity)
        assert(iscAccount, 'Failed to generate ISC account from fusion identity')
        log.stepEnd('generate-account')

        res.send(iscAccount)
        timer.end(`✓ Account creation completed for ${identityName}`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash(`Failed to create account ${identityName}`, error)
    }
}
