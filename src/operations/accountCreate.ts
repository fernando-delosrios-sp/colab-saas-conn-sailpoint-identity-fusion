import { AttributeChangeOp, ConnectorError, StdAccountCreateInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { assert } from '../utils/assert'
import { normalizeActionTokens } from '../utils/attributes'
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
    ServiceRegistry.setCurrent(serviceRegistry)
    const { log, identities, sources, schemas, fusion, attributes, res } = serviceRegistry

    let identityName = input.attributes.name ?? input.identity
    try {
        assert(input.schema, 'Account schema is required')

        await sources.fetchAllSources()
        await schemas.setFusionAccountSchema(input.schema)
        const { fusionDisplayAttribute } = schemas
        assert(fusionDisplayAttribute, 'Fusion display attribute not found in schema')

        identityName = input.attributes[fusionDisplayAttribute] ?? identityName
        assert(identityName, 'Identity name is required for account creation')

        log.info(`Creating account for identity: ${identityName}`)
        const timer = log.timer()

        // 1. Fetch Identity first to get the authoritative ID
        const identity = await identities.fetchIdentityByName(identityName)
        assert(identity, `Identity not found: ${identityName}`)
        assert(identity.id, `Identity ID is missing for: ${identityName}`)
        timer.phase('Step 1: Fetching identity information')

        // 2. Fetch all fusion accounts and register unique attribute values
        await sources.fetchFusionAccounts()
        await attributes.initializeCounters()
        // Bulk-register unique values directly from raw accounts (lightweight, no FusionAccount hydration)
        attributes.registerUniqueValuesFromRawAccounts(sources.fusionAccounts)
        // Still need preProcessFusionAccounts to populate fusionIdentityMap for duplicate checking
        await fusion.preProcessFusionAccounts()
        timer.phase('Step 2: Loading fusion accounts and registering unique values')

        // 3. Process the identity and refresh unique attributes
        await fusion.processIdentity(identity)

        const fusionIdentity = fusion.getFusionIdentity(identity.id)
        assert(fusionIdentity, `Fusion identity not found for identity ID: ${identity.id}`)
        log.debug(`Found fusion identity: ${fusionIdentity.nativeIdentity}`)
        fusionIdentity.addStatus('requested', 'Status set by accountCreate operation')

        await attributes.refreshUniqueAttributes(fusionIdentity)
        timer.phase('Step 3: Processing identity')

        const actions = normalizeActionTokens(input.attributes.actions)
        log.info(`Processing ${actions.length} action(s)`)

        for (const action of actions) {
            await executeActions(
                fusionIdentity,
                { op: AttributeChangeOp.Add, attribute: 'actions', value: action },
                serviceRegistry
            )
        }
        timer.phase(`Step 3: Processing ${actions.length} action(s)`)

        const iscAccount = await fusion.getISCAccount(fusionIdentity)
        assert(iscAccount, 'Failed to generate ISC account from fusion identity')
        timer.phase('Step 4: Generating ISC account')

        res.send(iscAccount)
        timer.end(`✓ Account creation completed for ${identityName}`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash(`Failed to create account ${identityName}`, error)
    }
}
