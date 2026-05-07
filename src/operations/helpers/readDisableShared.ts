import { StdAccountReadInput, StdAccountDisableInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { rebuildFusionAccount } from './rebuildFusionAccount'
import { assert } from '../../utils/assert'
import { ATTR_OPS_REFRESH } from '../../services/attributeService/types'

export const processReadOrDisable = async (
    serviceRegistry: ServiceRegistry,
    input: StdAccountReadInput | StdAccountDisableInput,
    operationType: 'read' | 'disable'
) => {
    const { log, fusion, schemas, sources, res } = serviceRegistry

    log.info(`${operationType === 'read' ? 'Reading' : 'Disabling'} account: ${input.identity}`)
    assert(input.identity, 'Account identity is required')
    const timer = log.timer()

    await sources.fetchAllSources()
    await schemas.setFusionAccountSchema(input.schema)
    timer.phase('Step 1: Loading sources and schema')

    const fusionAccount = await rebuildFusionAccount(input.identity, ATTR_OPS_REFRESH, serviceRegistry)
    assert(fusionAccount, `Fusion account not found for identity: ${input.identity}`)
    log.debug(`Found fusion account: ${fusionAccount.name || fusionAccount.nativeIdentity}`)
    timer.phase('Step 2: Rebuilding fusion account with fresh attributes')

    if (operationType === 'disable') {
        fusionAccount.disable()
        timer.phase('Step 3: Disabling fusion account')
    }

    await fusion.normalizePendingFormStateForOutput()
    const iscAccount = await fusion.getISCAccount(fusionAccount)
    assert(iscAccount, 'Failed to generate ISC account from fusion account')
    timer.phase(`Step ${operationType === 'disable' ? '4' : '3'}: Generating ISC account`)

    res.send(iscAccount)
    timer.end(`✓ Account ${operationType} completed for ${input.identity}`)
}
