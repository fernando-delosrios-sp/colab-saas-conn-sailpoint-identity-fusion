import { AttributeChangeOp, ConnectorError, StdAccountUpdateInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { rebuildFusionAccount } from './helpers/rebuildFusionAccount'
import { FusionAttribute } from '../data/schema'
import { FusionAction } from '../model/fusionAction'
import { assert } from '../utils/assert'
import { trimStr } from '../utils/safeRead'
import { executeActions } from './actions'
import { ATTR_OPS_NONE } from '../services/definitionService/types'

/**
 * Account update operation - Applies entitlement changes (actions) to a fusion account.
 *
 * Processes attribute changes from the platform, currently supporting action-type
 * entitlements: report, fusion, and correlate. Each action is executed sequentially
 * against the rebuilt fusion account.
 *
 * Processing Flow:
 * 1. SETUP: Load sources and schema
 * 2. REBUILD: Reconstruct the fusion account with refreshed attributes
 * 3. ACTIONS: Process each change by executing the corresponding action handler
 * 4. OUTPUT: Generate and return the updated ISC account representation
 *
 * @param serviceRegistry - Service registry providing access to all connector services
 * @param input - SDK input containing the account identity and list of attribute changes
 */
export const accountUpdate = async (serviceRegistry: ServiceRegistry, input: StdAccountUpdateInput) => {
    const { log, sources, schemas, fusion, res, config, identities } = serviceRegistry
    let accountLabel = input.identity

    try {
        assert(input.identity, 'Account identity is required')
        assert(input.changes, 'Account changes are required')
        assert(input.changes.length > 0, 'At least one change is required')
        const reverseCorrelationAttributes = config.sources
            .filter((sourceConfig) => sourceConfig.correlationMode === 'reverse' && sourceConfig.correlationAttribute)
            .map((sourceConfig) => sourceConfig.correlationAttribute as string)
        const reverseCorrelationSnapshot = new Map<string, { exists: boolean; value: unknown }>()
        const timer = log.timer()

        log.stepStart('load-sources-schema')
        await sources.fetchAllSources()
        if (reverseCorrelationAttributes.length > 0) {
            await sources.fetchFusionAccount(input.identity)
            const fusionSourceAccount = sources.fusionAccountsByNativeIdentity?.get(input.identity)
            const fusionSourceAttributes = (fusionSourceAccount?.attributes ?? {}) as Record<string, unknown>
            for (const attributeName of reverseCorrelationAttributes) {
                reverseCorrelationSnapshot.set(attributeName, {
                    exists: Object.prototype.hasOwnProperty.call(fusionSourceAttributes, attributeName),
                    value: fusionSourceAttributes[attributeName],
                })
            }
        }
        await schemas.setFusionAccountSchema(input.schema)
        log.stepEnd('load-sources-schema')

        log.stepStart('rebuild-fusion-account')
        const fusionAccount = await rebuildFusionAccount(input.identity, ATTR_OPS_NONE, {
            fusion,
            identities,
            sources,
            log,
        })
        assert(fusionAccount, `Fusion account not found for identity: ${input.identity}`)
        const { fusionDisplayAttribute } = schemas
        accountLabel =
            trimStr(fusionAccount.name) ??
            trimStr(
                fusionDisplayAttribute
                    ? (fusionAccount.attributes?.[fusionDisplayAttribute] as string | undefined)
                    : undefined
            ) ??
            input.identity
        log.detail({ account: accountLabel, action: 'updating account' })
        log.debug(`Found fusion account: ${accountLabel || fusionAccount.managedKey}`)
        log.stepEnd('rebuild-fusion-account')

        log.stepStart('process-changes', { count: input.changes.length })
        let shouldRecomputeCorrelationStatus = true
        for (const change of input.changes) {
            assert(change.attribute, 'Change attribute is required')

            if (change.attribute === FusionAttribute.Actions) {
                const actionValues = [change.value].flat().map((value) => String(value).split(':')[0])
                if (
                    change.op === AttributeChangeOp.Remove &&
                    actionValues.some((value) => value === 'correlate' || value === FusionAction.Correlated)
                ) {
                    shouldRecomputeCorrelationStatus = false
                }
                await executeActions(fusionAccount, change, serviceRegistry)
            } else {
                log.crash(`Unsupported entitlement change: ${change.attribute}`)
            }
        }
        log.stepEnd('process-changes', { count: input.changes.length })

        if (reverseCorrelationSnapshot.size > 0) {
            for (const [attributeName, snapshot] of reverseCorrelationSnapshot.entries()) {
                if (snapshot.exists) {
                    fusionAccount.setReverseCorrelationAttribute(attributeName, snapshot.value as string)
                } else {
                    fusionAccount.clearReverseCorrelationAttribute(attributeName)
                }
            }
        }

        log.stepStart('generate-account')
        const iscAccount = await fusion.getISCAccount(fusionAccount, true, shouldRecomputeCorrelationStatus)
        assert(iscAccount, 'Failed to generate ISC account from fusion account')
        log.stepEnd('generate-account')

        res.send(iscAccount)
        timer.end(`✓ Account update completed for ${accountLabel}`)
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        log.crash(`Failed to update account ${accountLabel}`, error)
    }
}


